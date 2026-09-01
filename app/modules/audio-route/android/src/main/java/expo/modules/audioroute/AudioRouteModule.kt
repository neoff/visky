package expo.modules.audioroute

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Current output route + the system output switcher.
 *
 * Android will not let an app route media on its own. `setCommunicationDevice`
 * is scoped to the call use case, and the per-player override
 * (`ExoPlayer.setPreferredAudioDevice`) sits inside react-native-track-player's
 * service. The supported switcher is the system output panel, added in API 29 —
 * the same sheet the media notification's output chip opens.
 */
class AudioRouteModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val audioManager: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private var deviceCallback: AudioDeviceCallback? = null

  override fun definition() = ModuleDefinition {
    Name("AudioRoute")

    Events("onRouteChange")

    Function("getRoutes") {
      snapshot()
    }

    AsyncFunction("presentOutputPicker") {
      openOutputPanel()
    }

    OnStartObserving {
      val handler = Handler(Looper.getMainLooper())
      val callback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
          sendEvent("onRouteChange", snapshot())
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
          sendEvent("onRouteChange", snapshot())
        }
      }
      deviceCallback = callback
      audioManager.registerAudioDeviceCallback(callback, handler)
    }

    OnStopObserving {
      deviceCallback?.let { audioManager.unregisterAudioDeviceCallback(it) }
      deviceCallback = null
    }
  }

  // ---------------------------------------------------------------- reading

  private fun snapshot(): Map<String, Any?> {
    val outputs = audioManager
      .getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      .filter { it.type !in IGNORED_TYPES }
      .distinctBy { it.id }

    return mapOf(
      "current" to currentDevice(outputs)?.let { describe(it) },
      "available" to outputs.map { describe(it) },
      "canPresentPicker" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q),
    )
  }

  /**
   * API 31 can answer the question directly — which device media actually goes
   * to. Below that (and if the call is unavailable on a given ROM) fall back to
   * the order the framework itself prefers: a Bluetooth set wins over a wired
   * one, wired wins over the speaker.
   */
  private fun currentDevice(outputs: List<AudioDeviceInfo>): AudioDeviceInfo? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
      val routed = runCatching { audioManager.getAudioDevicesForAttributes(attributes) }
        .getOrNull()
        ?.firstOrNull { device -> outputs.any { it.id == device.id } }
      if (routed != null) return routed
    }
    return outputs.minByOrNull { device ->
      val rank = PRIORITY.indexOf(device.type)
      if (rank == -1) PRIORITY.size else rank
    }
  }

  private fun describe(device: AudioDeviceInfo): Map<String, Any?> = mapOf(
    "id" to device.id.toString(),
    "name" to label(device),
    "kind" to kind(device.type),
  )

  private fun label(device: AudioDeviceInfo): String {
    // productName is the phone's own model for the built-in speaker, which
    // reads as nonsense in a list of outputs. Only trust it where it names a
    // real accessory — and even there it can be generic without
    // BLUETOOTH_CONNECT, which this app deliberately does not ask for.
    val product = runCatching { device.productName?.toString()?.trim() }.getOrNull()
    val named = !product.isNullOrEmpty() && device.type !in UNNAMED_TYPES
    if (named) return product!!

    return when (device.type) {
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Phone speaker"
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "Headphones"
      AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Headset"
      AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_USB_ACCESSORY -> "USB audio"
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER,
      AudioDeviceInfo.TYPE_BLE_BROADCAST -> "Bluetooth"
      AudioDeviceInfo.TYPE_HDMI, AudioDeviceInfo.TYPE_HDMI_ARC -> "HDMI"
      AudioDeviceInfo.TYPE_AUX_LINE -> "Line out"
      AudioDeviceInfo.TYPE_DOCK -> "Dock"
      else -> "Audio output"
    }
  }

  private fun kind(type: Int): String = when (type) {
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER,
    AudioDeviceInfo.TYPE_BLE_BROADCAST -> "bluetooth"
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET -> "headphones"
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
    AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE,
    AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb"
    AudioDeviceInfo.TYPE_HDMI, AudioDeviceInfo.TYPE_HDMI_ARC -> "hdmi"
    AudioDeviceInfo.TYPE_DOCK, AudioDeviceInfo.TYPE_AUX_LINE -> "car"
    else -> "unknown"
  }

  // ---------------------------------------------------------------- picker

  private fun openOutputPanel(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    val activity = appContext.currentActivity ?: return false

    // The panel is a Settings surface: it opens as a slice over the app, and
    // returning to the app is a normal back press. Some ROMs ship without it,
    // hence the fall back to the sound settings screen rather than a crash.
    val panel = Intent(MEDIA_OUTPUT_PANEL)
    if (panel.resolveActivity(activity.packageManager) != null) {
      activity.startActivity(panel)
      return true
    }
    val fallback = Intent(android.provider.Settings.ACTION_SOUND_SETTINGS)
    if (fallback.resolveActivity(activity.packageManager) != null) {
      activity.startActivity(fallback)
      return true
    }
    return false
  }

  companion object {
    private const val MEDIA_OUTPUT_PANEL = "android.settings.panel.action.MEDIA_OUTPUT"

    /** Not places music goes: the earpiece and the call path. */
    private val IGNORED_TYPES = setOf(
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
      AudioDeviceInfo.TYPE_TELEPHONY,
    )

    /** Types whose productName is the phone itself, not an accessory. */
    private val UNNAMED_TYPES = setOf(
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_AUX_LINE,
    )

    /** The order the framework itself routes in, best first. */
    private val PRIORITY = listOf(
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_BLE_SPEAKER,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_USB_ACCESSORY,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_HDMI,
      AudioDeviceInfo.TYPE_DOCK,
      AudioDeviceInfo.TYPE_AUX_LINE,
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
    )
  }
}
