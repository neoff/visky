/**
 * Signing a device out from another device.
 *
 * The removed app is usually not running when the button is pressed, so there
 * are two ways it can find out and both have to end in the same place: the
 * session is cleared and the app is back at the login screen.
 *
 *   * it IS running — the server sends a `revoked` frame and cuts the socket;
 *   * it was closed — its first request after launch comes back 401 with
 *     `device_revoked`, which is the case that matters most and the one with
 *     nothing live to observe it.
 *
 * The guard against raising it twice is not a detail: a revoked device finds
 * out several times within the same second — the socket dies and every request
 * already in flight fails — and a sign-out per answer would fight the
 * navigation the first one started.
 */
describe('a revoked session', () => {
  let revocation: typeof import('@/services/revocation')

  beforeEach(() => {
    jest.resetModules()
    revocation = require('@/services/revocation')
  })

  describe('recognising the answer', () => {
    it('is a 401 carrying device_revoked', () => {
      expect(revocation.isRevokedResponse(401, {errCode: 'device_revoked'})).toBe(true)
    })

    it('is not the 403 an app with no credentials at all gets', () => {
      // That one means "you never sent a token", and it happens on a perfectly
      // healthy cold start before the headers are in place. Clearing the
      // session for it would log the user out at random.
      expect(revocation.isRevokedResponse(403, {errCode: 'device_revoked'})).toBe(false)
    })

    it('is not any other 401', () => {
      expect(revocation.isRevokedResponse(401, {errMessage: 'token expired'})).toBe(false)
      expect(revocation.isRevokedResponse(401, undefined)).toBe(false)
      expect(revocation.isRevokedResponse(undefined, {errCode: 'device_revoked'})).toBe(false)
    })
  })

  it('clears the session once, however many answers say so', () => {
    const signOut = jest.fn()
    revocation.onSessionRevoked(signOut)

    revocation.sessionRevoked('playback socket')
    revocation.sessionRevoked('GET /api/playlist')
    revocation.sessionRevoked('GET /api/player/state')

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('arms again for the session signed in after it', () => {
    const signOut = jest.fn()
    revocation.onSessionRevoked(signOut)

    revocation.sessionRevoked('first')
    // the user logs in again on the same launch
    revocation.resetRevocation()
    revocation.sessionRevoked('second')

    expect(signOut).toHaveBeenCalledTimes(2)
  })

  it('does nothing when no provider is listening', () => {
    expect(() => revocation.sessionRevoked('nobody home')).not.toThrow()
  })
})

/**
 * The live half: the frame arrives on the playback socket.
 *
 * `stop()` before the handler runs, deliberately. The server closes the socket
 * immediately behind this frame, and a socket that reconnects on close would
 * start hammering an upgrade that is refused from here on.
 */
describe('the revoked frame', () => {
  class FakeSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    static last: FakeSocket | null = null

    readyState = FakeSocket.OPEN
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: {data: string}) => void) | null = null

    constructor() {
      FakeSocket.last = this
    }

    send() {
      /* the frames this device sends are not what is under test */
    }

    close() {
      this.readyState = FakeSocket.CLOSED
      this.onclose?.()
    }
  }

  it('drops the session and stops the socket', () => {
    jest.resetModules()
    ;(globalThis as {WebSocket?: unknown}).WebSocket = FakeSocket
    require('react-native').Platform.OS = 'ios'

    const revocation = require('@/services/revocation') as typeof import('@/services/revocation')
    const signOut = jest.fn()
    revocation.onSessionRevoked(signOut)

    const {playbackSync} = require('@/services/playbackSync') as typeof import('@/services/playbackSync')
    playbackSync.start({token: 't', userId: 'u1', deviceId: 'phone-1'} as never, () => undefined)

    const socket = FakeSocket.last!
    socket.onmessage?.({data: JSON.stringify({t: 'revoked', server_now_ms: Date.now()})})

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(playbackSync.isConnected).toBe(false)
  })
})
