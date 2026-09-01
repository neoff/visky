package expo.modules.car

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaControllerCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.support.v4.media.MediaBrowserCompat.MediaItem
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.session.MediaSessionCompat
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.media.MediaBrowserServiceCompat
import java.lang.ref.WeakReference

/**
 * What Android Auto talks to.
 *
 * react-native-track-player 4.1.2 cannot do this itself: its `MusicService` is a
 * plain HeadlessJsTaskService with no `android.media.browse.MediaBrowserService`
 * intent filter and no browse tree, so a car has nothing to discover. This
 * service supplies the missing half — the tree — and deliberately does NOT
 * supply playback.
 *
 * ONE SESSION, NOT TWO. The obvious shortcut is to open our own
 * MediaSessionCompat here and forward transport commands to JS. That produces
 * two live sessions for one app: two notifications, two sets of metadata, and a
 * head unit that picks whichever it saw last. Instead this service hands Android
 * Auto the session react-native-track-player already owns, so play/pause/skip,
 * the title, the artwork and the progress bar all come from the one place that
 * actually knows them.
 *
 * Reaching that session costs two reflection hops, which is a real liability and
 * is documented at [rntpSessionToken].
 */
class CarBrowserService : MediaBrowserServiceCompat() {
  private val handler = Handler(Looper.getMainLooper())

  /** Set once. MediaBrowserServiceCompat rejects a second call. */
  private var tokenSet = false
  private var tokenAttempts = 0

  /**
   * Whether this is a CAR running Android, rather than a phone painting one.
   *
   * The whole session strategy turns on this one bit, so it is read from the
   * platform rather than inferred from who happens to be browsing.
   */
  private val automotive: Boolean by lazy {
    packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)
  }

  /**
   * Our own session — on Automotive OS ONLY, and this exception is the point.
   *
   * THE PHONE ALWAYS OWNS THE SESSION. It holds the player, the queue and the
   * library; it is the source of truth, and a second session beside it is the
   * bug this file was written to avoid — two notifications, two sets of
   * metadata, and a head unit that picks whichever it saw last.
   *
   * Automotive OS is not that situation. There is no phone: the car starts this
   * service by itself, with no Activity, no JS runtime and no player, so
   * react-native-track-player owns nothing to adopt. And
   * `MediaBrowserServiceCompat` holds every client connection until
   * `setSessionToken` is called — so with no token the car never even asks for
   * the tree. That is not a missing feature, it is a deadlock: correct data,
   * cached, unreachable.
   *
   * `setSessionToken` may be called exactly once, so there is no placeholder to
   * hand over later. On a car we own the session and mirror the player's state
   * into it; on a phone we do not create one at all.
   */
  private var ownSession: MediaSessionCompat? = null
  private var mirror: MediaControllerCompat? = null

  /** Callers parked in [onLoadChildren] while the tree was still empty. */
  private val waiting = mutableListOf<Pair<String, Result<MutableList<MediaItem>>>>()

  /**
   * Every parent this service has actually answered for.
   *
   * `notifyChildrenChanged` only means anything for a node a browser is
   * subscribed to, and MediaBrowserServiceCompat does not expose its
   * subscription list. Having served a node is the closest usable proxy: the
   * driver is inside an artist's tracks precisely when we have answered for
   * that artist. Notifying only the roots, as this did, left that screen
   * showing the queue as it was two songs ago.
   */
  private val served = mutableSetOf<String>()

  /** One redraw callback per parent, so [scheduleRedraw] can cancel its own. */
  private val redraws = mutableMapOf<String, Runnable>()

  private var musicService: WeakReference<Any>? = null

  private val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
      // MusicBinder is an inner class exposing `service`; it is public API of
      // the package, unlike everything below it.
      val service = runCatching {
        binder?.javaClass?.getMethod("getService")?.invoke(binder)
      }.getOrNull() ?: runCatching {
        binder?.javaClass?.getDeclaredField("service")
          ?.apply { isAccessible = true }?.get(binder)
      }.getOrNull()

      musicService = service?.let { WeakReference(it) }
      adoptSessionToken()
    }

    override fun onServiceDisconnected(name: ComponentName?) {
      musicService = null
    }
  }

  override fun onCreate() {
    super.onCreate()

    // Before anything else: the tree as it was when the app last ran. On
    // Automotive OS this service IS the app as far as the car is concerned, and
    // nothing else of ours is alive to publish one.
    // A fallback for the case the JS module never came up at all: the service
    // can be started by the car on its own, long before anything else of ours.
    if (CarLink.context == null) CarLink.context = applicationContext
    CarLink.restore(applicationContext)

    CarLink.onTree = { handler.post { treeChanged() } }
    CarLink.setConnected(true)
    // JS may be running with a tree we have never seen, or not running at all.
    CarLink.send("refresh")

    if (automotive) startOwnSession()
    bindToTrackPlayer()
  }

  override fun onDestroy() {
    mirror?.unregisterCallback(mirrorCallback)
    mirror = null
    ownSession?.run {
      isActive = false
      release()
    }
    ownSession = null
    served.clear()
    CarLink.onTree = null
    CarLink.setConnected(false)
    runCatching { unbindService(connection) }
    redraws.clear()
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  // MARK: - Browsing

  /**
   * Who is allowed to see the library.
   *
   * An exported browser service that returns a root to everyone hands the
   * user's music to any app on the device that cares to ask. Android Auto and
   * the Desktop Head Unit connect under known package names; our own process
   * is allowed so the app can browse itself.
   */
  override fun onGetRoot(
    clientPackageName: String,
    clientUid: Int,
    rootHints: Bundle?
  ): BrowserRoot? {
    val allowed = clientPackageName == packageName ||
      clientPackageName in ALLOWED_CLIENTS ||
      isPlatformApp(clientPackageName)
    Log.i(TAG, "onGetRoot from $clientPackageName -> ${if (allowed) "allowed" else "denied"}")
    return if (allowed) BrowserRoot(CarLink.ROOT, null) else null
  }

  /**
   * On a car, the browser IS the platform.
   *
   * A name list works for Android Auto, where the caller is always Google's
   * projection app. It does not work for Android Automotive OS, where the media
   * centre is part of the system image and its package name is whatever the
   * manufacturer shipped — `com.android.car.media` on AOSP, something else on a
   * real car. Hard-coding names there means the app is invisible in every
   * vehicle nobody thought to add to the list.
   *
   * A package signed with the platform key, or installed in the system image,
   * is by definition as trusted as the OS holding the library. Everything else
   * still has to be named.
   */
  private fun isPlatformApp(clientPackageName: String): Boolean = runCatching {
    val info = packageManager.getApplicationInfo(clientPackageName, 0)
    val system = info.flags and
      (ApplicationInfo.FLAG_SYSTEM or ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)
    system != 0
  }.getOrDefault(false)

  override fun onLoadChildren(parentId: String, result: Result<MutableList<MediaItem>>) {
    // A cold head unit connects before JS is up. Detaching parks the caller
    // rather than answering "this node is empty", which Android Auto would
    // cache and show as an empty library.
    if (!CarLink.hasTree) {
      result.detach()
      waiting += parentId to result
      CarLink.send("refresh")
      return
    }
    served += parentId
    val items = itemsUnder(parentId)
    Log.i(TAG, "onLoadChildren $parentId -> ${items.size} items (tokenSet=$tokenSet)")
    result.sendResult(items)
  }

  private fun itemsUnder(parentId: String): MutableList<MediaItem> =
    CarLink.nodes(parentId).mapNotNull { toMediaItem(parentId, it) }.toMutableList()

  private fun toMediaItem(parentId: String, node: Map<String, Any?>): MediaItem? {
    val id = node["id"] as? String ?: return null
    val browsable = node["browsable"] as? Boolean ?: false

    val description = MediaDescriptionCompat.Builder()
      .setMediaId(id)
      .setTitle(node["title"] as? String)
      .setSubtitle(node["subtitle"] as? String)
      .apply { artworkUri(parentId, node["artwork"] as? String)?.let { setIconUri(it) } }
      .build()

    val flags = if (browsable) MediaItem.FLAG_BROWSABLE else MediaItem.FLAG_PLAYABLE
    return MediaItem(description, flags)
  }

  /**
   * The cached cover, or nothing yet.
   *
   * The tree carries the remote url the phone UI uses, and the car cannot fetch
   * one — see CarArtwork. So a row goes out without an icon the first time,
   * the bytes are fetched behind it, and the list is told to redraw when they
   * arrive. Better a placeholder for a second than a page that waits.
   */
  private fun artworkUri(parentId: String, artwork: String?): Uri? {
    val url = artwork?.takeIf { it.isNotBlank() } ?: return null
    CarArtwork.uri(this, url)?.let { return it }
    CarArtwork.prefetch(this, url) { scheduleRedraw(parentId) }
    return null
  }

  /**
   * Coalesced: a page of fifty covers finishes downloading as fifty separate
   * events, and telling the car to redraw fifty times makes the list flicker
   * and does no more than telling it once.
   */
  private fun scheduleRedraw(parentId: String) {
    // Hop to the main thread first: this is called from the download pool, and
    // both `redraws` and notifyChildrenChanged want one thread.
    handler.post {
      val redraw = redraws.getOrPut(parentId) { Runnable { notifyChildrenChanged(parentId) } }
      handler.removeCallbacks(redraw)
      handler.postDelayed(redraw, REDRAW_DEBOUNCE_MS)
    }
  }

  private fun treeChanged() {
    if (waiting.isNotEmpty()) {
      val pending = waiting.toList()
      waiting.clear()
      for ((parentId, result) in pending) {
        served += parentId
        runCatching { result.sendResult(itemsUnder(parentId)) }
      }
    }

    // Tell any attached browser that the tree moved, so a list already on
    // screen redraws instead of showing the queue as it was two songs ago.
    notifyChildrenChanged(CarLink.ROOT)
    for (parentId in served.toList()) {
      if (parentId != CarLink.ROOT) notifyChildrenChanged(parentId)
    }
  }

  // MARK: - Our own session, on a car only

  /**
   * The transport the car draws, wired straight to JS.
   *
   * Every callback maps to a command the phone side already understands. `onPlay`
   * and `onPause` are deliberately NOT folded into `playPause`: a head unit sends
   * whichever one it means, and a toggle gets it backwards exactly when the car
   * and the player disagree.
   */
  private val carCallback = object : MediaSessionCompat.Callback() {
    override fun onPlay() = command("resume")
    override fun onPause() = command("pause")
    override fun onStop() = command("pause")
    override fun onSkipToNext() = command("next")
    override fun onSkipToPrevious() = command("previous")
    override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
      command("play", mediaId ?: return)
    }

    private fun command(name: String, nodeId: String? = null) {
      // A command means playback is about to exist. The token search is bounded
      // on purpose — a driver who only browses must not be polled for the whole
      // trip — so by now it has usually given up, and `bindService` with no
      // CREATE flag leaves nothing behind to fire onServiceConnected when
      // track-player finally starts. Without re-arming here the car plays audio
      // and shows "Loading content..." for ever, because our session is never
      // given anything to mirror.
      rearmTokenSearch()

      val cold = CarLink.onCommand == null
      // Held, not dropped: CarLink parks it and hands it over the moment the
      // module attaches. Logged either way, because "the list works and the
      // buttons do not" is otherwise an afternoon of guessing.
      CarLink.send(name, nodeId)
      if (cold) {
        Log.w(TAG, "command $name held: no JS runtime yet, starting one")
        startRuntime()
      }
    }
  }

  /**
   * Bring up the JS runtime with no Activity in front of anyone.
   *
   * Android Automotive starts this service from a cold boot: there is no phone
   * app that could have started it, and a media app has no business throwing an
   * Activity at a driver. `ReactHost.start()` is the sanctioned headless boot —
   * the same one a background task uses — and `PlayerRegisterService` calls
   * `startCarLink()` as it comes up, which is what re-attaches the listener and
   * releases the command held above.
   *
   * Safe to call when a runtime is already starting or started; ReactHost keeps
   * one instance and returns the in-flight task.
   */
  /**
   * Stand in the foreground while the runtime comes up.
   *
   * react-native-track-player refuses to create a player from the background:
   *
   *   Error: On Android the app must be in the foreground when setting up the
   *   player.  (android_cannot_setup_player_in_background)
   *
   * On a phone that never bites, because a person opened the app. In a car the
   * foreground belongs to `com.android.car.media` and our process never is —
   * on real hardware exactly as much as on the emulator — so without this the
   * tap reaches JS and dies one line later.
   *
   * Legitimate rather than a trick: the car grants the package a short FGS
   * allowlist when it dispatches the tap ("MediaSessionRecord:playFromMediaId
   * [WIU] [FGS]" in the log), which is the window this uses. Released as soon
   * as track-player's own service appears, and on a timer if it never does, so
   * a failed start cannot leave a notification sitting in the shade.
   */
  private var heldForeground = false

  private fun holdForeground() {
    if (heldForeground) return

    runCatching {
      val manager = getSystemService(NotificationManager::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
        manager.createNotificationChannel(
          NotificationChannel(
            FOREGROUND_CHANNEL,
            "Starting playback",
            NotificationManager.IMPORTANCE_LOW,
          ).apply { setShowBadge(false) }
        )
      }

      val notification: Notification = NotificationCompat.Builder(this, FOREGROUND_CHANNEL)
        .setContentTitle("Starting playback")
        .setSmallIcon(applicationInfo.icon)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setOngoing(true)
        .build()

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          FOREGROUND_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
        )
      } else {
        startForeground(FOREGROUND_ID, notification)
      }

      heldForeground = true
      Log.i(TAG, "holding the foreground so the player can be created")
      handler.postDelayed(releaseForeground, FOREGROUND_GRACE_MS)
    }.onFailure { Log.w(TAG, "could not hold the foreground", it) }
  }

  // Explicit type: the body refers to the property, which defeats inference.
  private val releaseForeground: Runnable = Runnable {
    if (!heldForeground) return@Runnable
    heldForeground = false
    handler.removeCallbacks(releaseForeground)
    runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
      .onFailure { Log.w(TAG, "could not release the foreground", it) }
    Log.i(TAG, "released the foreground")
  }

  private fun startRuntime() {
    holdForeground()

    // Reflective for the same reason rntpSessionToken() below is: this module
    // compiles as a plain Android library and React is not on its classpath.
    // `ReactApplication.reactHost` is Kotlin, so the accessor is getReactHost().
    runCatching {
      val app = applicationContext
      val host = app.javaClass.methods
        .firstOrNull { it.name == "getReactHost" && it.parameterCount == 0 }
        ?.invoke(app)

      if (host == null) {
        Log.w(TAG, "no ReactHost on this application; the runtime cannot be started")
        return
      }

      host.javaClass.methods
        .firstOrNull { it.name == "start" && it.parameterCount == 0 }
        ?.invoke(host)
        ?: Log.w(TAG, "ReactHost has no start(); the runtime cannot be started")
    }.onFailure { Log.w(TAG, "the JS runtime would not start", it) }
  }

  private fun startOwnSession() {
    val session = MediaSessionCompat(this, "visky-car")
    session.setCallback(carCallback)
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(TRANSPORT_ACTIONS)
        .setState(PlaybackStateCompat.STATE_NONE, 0L, 1f)
        .build()
    )
    session.isActive = true
    ownSession = session
    sessionToken = session.sessionToken
    tokenSet = true
    Log.i(TAG, "automotive: owning the session, nothing else here can")
  }

  /**
   * Copy the player's state into the session the car is watching.
   *
   * The phone remains the source of truth even here — this only re-publishes
   * what react-native-track-player already decided, once its service exists.
   * Without it the car would show the right list and a blank now-playing.
   */
  private val mirrorCallback = object : MediaControllerCompat.Callback() {
    override fun onMetadataChanged(metadata: MediaMetadataCompat?) {
      metadata?.let { ownSession?.setMetadata(it) }
    }

    override fun onPlaybackStateChanged(state: PlaybackStateCompat?) {
      val from = state ?: return
      ownSession?.setPlaybackState(
        PlaybackStateCompat.Builder(from).setActions(TRANSPORT_ACTIONS).build()
      )
    }
  }

  private fun startMirroring(token: MediaSessionCompat.Token) {
    if (mirror != null) return
    runCatching {
      val controller = MediaControllerCompat(this, token)
      controller.registerCallback(mirrorCallback)
      mirror = controller
      controller.metadata?.let { ownSession?.setMetadata(it) }
      controller.playbackState?.let { mirrorCallback.onPlaybackStateChanged(it) }
      Log.i(TAG, "automotive: mirroring track-player's state into our session")
      // track-player has its own foreground service now; ours has done its job.
      handler.post(releaseForeground)
    }.onFailure { Log.w(TAG, "could not mirror the player's session", it) }
  }

  // MARK: - The session

  private fun bindToTrackPlayer() {
    val intent = Intent().setClassName(packageName, TRACK_PLAYER_SERVICE)
    // No BIND_AUTO_CREATE on purpose: browsing must not start the playback
    // service, which would put up a foreground notification for nothing. If
    // playback is not running there is no session to adopt yet, and the retry
    // below picks it up when there is.
    val bound = runCatching { bindService(intent, connection, 0) }.getOrDefault(false)
    if (!bound || !tokenSet) {
      handler.postDelayed(::retryToken, TOKEN_RETRY_MS)
    }
  }

  /**
   * Keep looking for the session, but not forever.
   *
   * There is a legitimate steady state where the token never arrives: the
   * driver is browsing and has not pressed play, so react-native-track-player's
   * service is not running and owns no session. Retrying to the end of time
   * would poll for the whole trip. Giving up after a bounded window and letting
   * [onServiceConnected] pick it up when playback does start costs nothing.
   */
  /** Start the bounded token search over, from a point where it should succeed. */
  private fun rearmTokenSearch() {
    if (mirror != null) return
    tokenAttempts = 0
    handler.removeCallbacks(::retryToken)
    handler.postDelayed(::retryToken, TOKEN_RETRY_MS)
  }

  private fun retryToken() {
    if (tokenSet && !automotive) return
    if (automotive && mirror != null) return

    if (musicService?.get() == null) {
      runCatching {
        bindService(Intent().setClassName(packageName, TRACK_PLAYER_SERVICE), connection, 0)
      }
    } else {
      adoptSessionToken()
    }

    if (tokenSet && !automotive) return
    if (automotive && mirror != null) return
    tokenAttempts += 1
    if (tokenAttempts < TOKEN_MAX_ATTEMPTS) {
      handler.postDelayed(::retryToken, TOKEN_RETRY_MS)
    }
  }

  private fun adoptSessionToken() {
    val service = musicService?.get() ?: return

    // On a car we already own the session; the player's is only a source to
    // copy from. On a phone the player's session IS the one the head unit gets.
    if (automotive) {
      rntpSessionToken(service)?.let { startMirroring(it) }
      return
    }

    if (tokenSet) return
    val token = rntpSessionToken(service)
    if (token == null) {
      // The reflection below is the fragile part of this file. Saying so in the
      // log is the difference between "transport is dead in the car" being a
      // five-minute diagnosis and an afternoon.
      Log.w(TAG, "no MediaSession token from track-player yet (attempt $tokenAttempts)")
      return
    }
    sessionToken = token
    tokenSet = true
    Log.i(TAG, "adopted track-player's MediaSession")
    // Only the retry, not every pending post: the tree updates go through the
    // same handler and cancelling those here would freeze the browse list.
    handler.removeCallbacks(::retryToken)
  }

  /**
   * The two reflection hops, and why they are here.
   *
   * `MusicService.player` is private, and the MediaSessionCompat inside
   * kotlinaudio's NotificationManager is private too. Neither package exposes
   * the session token in any public form — checked against
   * react-native-track-player 4.1.2 and kotlinaudio v2.1.0, both pinned in the
   * lockfile, both frozen (RNTP 4.x is still on ExoPlayer 2, which is itself
   * end-of-life).
   *
   * The alternative was a second MediaSession of our own, which is worse in a
   * way the user would actually see — see the class comment. So: reflection,
   * wrapped so that failing to find the field costs the car its transport
   * controls and nothing else. Browsing still works, and playback from the
   * phone is untouched.
   *
   * If this ever returns null after an RNTP upgrade, that is the thing to fix
   * first, and it will be visible immediately as a head unit with a working
   * library and dead buttons.
   */
  private fun rntpSessionToken(service: Any): MediaSessionCompat.Token? = runCatching {
    val player = service.javaClass
      .getDeclaredField("player")
      .apply { isAccessible = true }
      .get(service) ?: return null

    val notificationManager = player.javaClass
      .getMethod("getNotificationManager")
      .invoke(player) ?: return null

    val session = notificationManager.javaClass
      .getDeclaredField("mediaSession")
      .apply { isAccessible = true }
      .get(notificationManager) as? MediaSessionCompat ?: return null

    session.sessionToken
  }.getOrNull()

  companion object {
    private const val TRACK_PLAYER_SERVICE =
      "com.doublesymmetry.trackplayer.service.MusicService"

    /**
     * Android Auto's phone-side app, and the Desktop Head Unit used to develop
     * against it. A car does not connect directly; it goes through these.
     *
     * Automotive OS callers are NOT listed here — see [isPlatformApp].
     */
    private val ALLOWED_CLIENTS = setOf(
      "com.google.android.projection.gearhead",
      "com.google.android.gms",
      "com.google.android.googlequicksearchbox",
    )

    /** What the car may ask of us; the phone does the actual work. */
    private const val TRANSPORT_ACTIONS =
      PlaybackStateCompat.ACTION_PLAY or
        PlaybackStateCompat.ACTION_PAUSE or
        PlaybackStateCompat.ACTION_PLAY_PAUSE or
        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
        PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
        PlaybackStateCompat.ACTION_STOP

    private const val TAG = "==car"
    private const val FOREGROUND_CHANNEL = "car-runtime"
    private const val FOREGROUND_ID = 0x0CA5
    /** Long enough for a cold JS start, short enough not to strand a notification. */
    private const val FOREGROUND_GRACE_MS = 60_000L

    private const val TOKEN_RETRY_MS = 2_000L

    /** Long enough to collect a burst of finished downloads, short enough not to notice. */
    private const val REDRAW_DEBOUNCE_MS = 400L

    /** ~1 minute of looking, then wait for playback to announce itself. */
    private const val TOKEN_MAX_ATTEMPTS = 30
  }
}
