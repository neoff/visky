import {useEffect, useRef} from 'react'
import {Platform} from 'react-native'
import Constants from 'expo-constants'
import TrackPlayer, {Event, Track, useTrackPlayerEvents} from 'react-native-track-player'
import {useSession} from '@/components/SessionProvider'
import {deviceLabel} from '@/helpers/device'
import {trackKey} from '@/helpers/miscellaneous'
import {registerPlaybackDevice} from '@/helpers/network'
import {isApplyingRemote, reconcile, restoreCached} from '@/services/playbackReconciler'
import {playbackSync} from '@/services/playbackSync'
import {listenForWakePush, registerForWakePush} from '@/services/pushWake'
import {usePlaybackStore} from '@/store/playback'
import {useQueue} from '@/store/queue'
import {PlaybackContext, PlaybackTrackRef} from '@/types/playback'

/**
 * Keeps this device in the account's playback session.
 *
 * Two directions, and both are one-way streets:
 *   * down — the server's state is applied to the player (services/playbackReconciler);
 *   * up   — only the device that OWNS the sound reports its position, plus any
 *            device the user starts a track on, which is how pressing play here
 *            takes the sound away from there.
 *
 * Anything the reconciler does to the player is flagged, so applying a transfer
 * never bounces back up as a report and fights the transfer itself.
 */

/** How often the active device tells the session where it is. */
const PROGRESS_INTERVAL_MS = 5_000

const toTrackRef = (track: Track | undefined | null): PlaybackTrackRef | null => {
  const id = trackKey(track as never)
  if (!track || !id) return null
  const raw = track as unknown as {id?: number | string; owner_id?: number | string}
  return {
    track_id: id,
    owner_id: Number(raw.owner_id ?? 0),
    id: Number(raw.id ?? 0),
    title: track.title,
    artist: typeof track.artist === 'string' ? track.artist : undefined,
    artwork: typeof track.artwork === 'string' ? track.artwork : undefined,
    duration: track.duration,
  }
}

/** Which list the queue came from, so the receiving device can rebuild it. */
const toContext = (queueId: string | null): PlaybackContext => {
  if (!queueId) return {kind: 'unknown'}
  if (queueId.startsWith('favorites')) return {kind: 'favorites'}
  if (queueId.startsWith('songs')) return {kind: 'frisky'}
  return {kind: 'unknown'}
}

export const usePlaybackSync = () => {
  const {getSession, deviceId} = useSession()
  const session = getSession()
  const {activeQueueId} = useQueue()
  const queueIdRef = useRef<string | null>(activeQueueId)
  queueIdRef.current = activeQueueId

  const token = session?.access_token
  const userId = session?.user_id

  useEffect(() => {
    if (!token || !userId || !deviceId) return

    let cancelled = false
    const wakeListener = listenForWakePush()

    // Show the last track straight away, from the cached snapshot, instead of
    // waiting for the socket. Paused, always: the server decides who plays.
    const cached = usePlaybackStore.getState().state
    if (cached) void restoreCached(cached)

    void (async () => {
      // A push token is optional: without it this device simply cannot be woken
      // once its socket dies, and the picker will show it as offline.
      const pushToken = await registerForWakePush()
      if (cancelled) return

      const name = Constants.deviceName ?? deviceLabel()
      const appVersion = Constants.expoConfig?.version

      playbackSync.start(
        {
          token,
          userId: String(userId),
          deviceId,
          secret: session?.secret,
          name,
          platform: Platform.OS,
          appVersion,
          pushToken: pushToken ?? undefined,
        },
        (state) => void reconcile(state),
      )

      // Also register over REST: it is the path that works when the socket
      // cannot be established at all, and it is what stores the push token.
      registerPlaybackDevice({
        name,
        platform: Platform.OS,
        app_version: appVersion,
        ...(pushToken ? {push_token: pushToken} : {}),
      }).catch((error) => console.warn('==playback: device registration failed', error))
    })()

    return () => {
      cancelled = true
      wakeListener.remove()
      playbackSync.stop()
    }
  }, [token, userId, deviceId])

  // The user picked a track here: that is a takeover, whoever was playing.
  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], async (event) => {
    if (isApplyingRemote()) return
    const ref = toTrackRef(event.track ?? (await TrackPlayer.getActiveTrack()))
    if (!ref) return

    // Loading the session's own track while another device owns the sound is
    // the reconciler restoring it on screen, not the user starting it — and it
    // can land after the "applying" window closes, because the native player
    // reports it whenever it feels like it. A real tap on that same track still
    // takes over: it also starts playback, which the state handler below sees.
    const store = usePlaybackStore.getState()
    const passive = store.state?.active_device_id !== store.deviceId
    if (passive && store.state?.track?.track_id === ref.track_id) return
    const {position} = await TrackPlayer.getProgress()
    playbackSync.sendUpdate({
      track: ref,
      context: toContext(queueIdRef.current),
      position_ms: Math.round(position * 1000),
      playing: true,
    })
  })

  // Play/pause made here. Only interesting if we own the sound — a pause we
  // performed because another device took over must never travel back up.
  useTrackPlayerEvents([Event.PlaybackState, Event.PlaybackPlayWhenReadyChanged], async () => {
    if (isApplyingRemote()) return
    const store = usePlaybackStore.getState()
    const isActive = store.state?.active_device_id === store.deviceId
    // the INTENT, not the momentary state: a buffering or freshly loaded track
    // is not "paused", and reporting it as such would stop every other device
    const playing = await TrackPlayer.getPlayWhenReady()
    if (!isActive && !playing) return

    const {position} = await TrackPlayer.getProgress()
    const track = toTrackRef(await TrackPlayer.getActiveTrack())
    playbackSync.sendUpdate({
      ...(isActive ? {} : {track, context: toContext(queueIdRef.current)}),
      position_ms: Math.round(position * 1000),
      playing,
    })
  })

  // The heartbeat that keeps every other device's progress bar honest.
  useEffect(() => {
    const timer = setInterval(async () => {
      const store = usePlaybackStore.getState()
      if (!store.connected || store.state?.active_device_id !== store.deviceId) return
      if (isApplyingRemote()) return
      const {position} = await TrackPlayer.getProgress()
      const playing = await TrackPlayer.getPlayWhenReady()
      const track = await TrackPlayer.getActiveTrack()
      playbackSync.sendProgress(position * 1000, playing, trackKey(track as never))
    }, PROGRESS_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])
}
