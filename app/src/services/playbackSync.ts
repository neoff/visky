import {AppState, AppStateStatus, Platform} from 'react-native'
import {apiUrls} from '@/constants'
import {usePlaybackStore} from '@/store/playback'
import {PlaybackState, PlaybackUpdate, ServerFrame} from '@/types/playback'

/**
 * The device's end of the playback session.
 *
 * A socket, not a poll and not a push: a transfer has to arrive in tens of
 * milliseconds carrying a position that is still true when it lands. Silent
 * pushes are throttled, unordered and cannot start audio — the backend only
 * uses one to WAKE a device whose socket has died, and the device then pulls
 * the state through this very connection.
 *
 * While the app is playing audio it stays alive in the background on both
 * platforms (iOS background audio mode, Android's foreground service), so the
 * socket survives a locked screen. Once playback stops and the OS suspends the
 * app, the socket goes with it — which is exactly why an idle, backgrounded
 * device shows up as offline in the picker rather than pretending otherwise.
 */

export interface SyncSession {
  token: string
  userId: string
  deviceId: string
  secret?: string
  name?: string
  platform?: string
  appVersion?: string
  pushToken?: string
}

type StateHandler = (state: PlaybackState) => void

/**
 * React Native's WebSocket accepts a third `options` argument (headers among
 * them); the ambient DOM typing does not know about it.
 */
type RNWebSocket = new (
  url: string,
  protocols?: string | string[],
  options?: {headers?: Record<string, string>},
) => WebSocket
const RNWebSocket = WebSocket as unknown as RNWebSocket

const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const PING_INTERVAL_MS = 20_000

class PlaybackSync {
  private socket: WebSocket | null = null
  private session: SyncSession | null = null
  private handler: StateHandler | null = null
  private reconnectDelay = RECONNECT_MIN_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private appStateSub: {remove: () => void} | null = null
  private bestRtt = Number.POSITIVE_INFINITY
  private stopped = true

  start(session: SyncSession, handler: StateHandler): void {
    this.session = session
    this.handler = handler
    this.stopped = false
    usePlaybackStore.getState().setDeviceId(session.deviceId)

    if (!this.appStateSub) {
      this.appStateSub = AppState.addEventListener('change', this.onAppState)
    }
    this.connect()
  }

  stop(): void {
    this.stopped = true
    this.session = null
    this.clearTimers()
    this.appStateSub?.remove()
    this.appStateSub = null
    this.socket?.close()
    this.socket = null
    usePlaybackStore.getState().setConnected(false)
  }

  /** Woken by a silent push, or brought back to the foreground: reconnect now. */
  wake(): void {
    if (this.stopped || !this.session) return
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return
    this.reconnectDelay = RECONNECT_MIN_MS
    this.connect()
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  /** Tell the session what this device is playing. Only the active device may. */
  sendUpdate(update: PlaybackUpdate): void {
    this.send({t: 'update', update})
  }

  sendProgress(positionMs: number, playing: boolean, trackId?: string): void {
    this.send({t: 'progress', position_ms: Math.round(positionMs), playing, track_id: trackId})
  }

  /** Hand the sound to another device (or take it back: pass this device's id). */
  transferTo(deviceId: string, play?: boolean): void {
    this.send({t: 'transfer', to_device_id: deviceId, play})
  }

  private send(frame: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    try {
      this.socket.send(JSON.stringify(frame))
    } catch (error) {
      console.warn('==playback: could not send', frame.t, error)
    }
  }

  private connect(): void {
    const session = this.session
    if (!session || this.stopped) return
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    console.log('==playback: connecting', apiUrls.playerSocketUrl)
    // RN's WebSocket takes headers as a third argument — the same `x-auth-*`
    // the REST calls use, so the socket needs no separate credential.
    const socket = new RNWebSocket(apiUrls.playerSocketUrl, undefined, {
      headers: {
        'x-auth-token': session.token,
        'x-auth-user': session.userId,
        'x-auth-device': session.deviceId,
        ...(session.secret ? {'x-auth-secret': session.secret} : {}),
      },
    })
    this.socket = socket

    socket.onopen = () => {
      console.log('==playback: socket open')
      this.reconnectDelay = RECONNECT_MIN_MS
      usePlaybackStore.getState().setConnected(true)
      this.send({
        t: 'hello',
        device_id: session.deviceId,
        name: session.name,
        platform: session.platform ?? Platform.OS,
        app_version: session.appVersion,
        push_token: session.pushToken,
      })
      this.ping()
      this.pingTimer = setInterval(() => this.ping(), PING_INTERVAL_MS)
    }

    socket.onmessage = (event) => {
      let frame: ServerFrame
      try {
        frame = JSON.parse(String(event.data)) as ServerFrame
      } catch {
        return
      }
      this.onFrame(frame)
    }

    socket.onerror = (event) => console.warn('==playback: socket error', (event as {message?: string})?.message)

    socket.onclose = () => {
      usePlaybackStore.getState().setConnected(false)
      if (this.pingTimer) {
        clearInterval(this.pingTimer)
        this.pingTimer = null
      }
      if (this.socket === socket) this.socket = null
      if (!this.stopped) this.scheduleReconnect()
    }
  }

  private onFrame(frame: ServerFrame): void {
    const store = usePlaybackStore.getState()
    switch (frame.t) {
      case 'state':
        this.trackClock(frame.server_now_ms)
        store.setState(frame.state)
        this.handler?.(frame.state)
        return
      case 'devices':
        this.trackClock(frame.server_now_ms)
        store.setDevices(frame.devices)
        return
      case 'pong': {
        if (frame.client_now_ms === undefined) return
        const rtt = Date.now() - frame.client_now_ms
        // Keep the offset from the FASTEST exchange seen: a slow round trip
        // says nothing useful about the clocks, only about the network.
        if (rtt <= this.bestRtt) {
          this.bestRtt = rtt
          store.setClockOffset(frame.server_now_ms + rtt / 2 - Date.now())
        }
        return
      }
      case 'error':
        console.warn('==playback: server said', frame.message)
        return
    }
  }

  private ping(): void {
    this.send({t: 'ping', client_now_ms: Date.now()})
  }

  private trackClock(serverNowMs: number): void {
    // a first, rough offset until a ping/pong pair gives a better one
    if (this.bestRtt === Number.POSITIVE_INFINITY) {
      usePlaybackStore.getState().setClockOffset(serverNowMs - Date.now())
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    const delay = this.reconnectDelay
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
    console.log(`==playback: reconnecting in ${delay}ms`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private onAppState = (status: AppStateStatus): void => {
    // Coming back to the foreground is the one moment a suspended socket is
    // guaranteed to be stale — the OS froze it without telling anyone.
    if (status === 'active') {
      this.bestRtt = Number.POSITIVE_INFINITY // the clock may have drifted while frozen
      this.wake()
    }
  }
}

export const playbackSync = new PlaybackSync()
