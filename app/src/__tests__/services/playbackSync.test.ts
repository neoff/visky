/**
 * "Не прописался девайс!!!!!!"
 *
 * The desktop appeared nowhere in the account, so nothing about cross-device
 * playback could work from it. React Native's `WebSocket` takes a third
 * argument with headers; the BROWSER's constructor takes only (url, protocols)
 * and drops everything after it — so the desktop connected with no credentials
 * at all and the server closed it at the upgrade, silently, every time.
 */
describe('the playback socket', () => {
  const opened: {url: string; args: unknown[]}[] = []

  class FakeSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    readyState = FakeSocket.CONNECTING
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: unknown) => void) | null = null

    constructor(url: string, ...args: unknown[]) {
      opened.push({url, args})
    }

    send() {
      /* never open in these tests */
    }
    close() {
      this.readyState = FakeSocket.CLOSED
    }
  }

  const session = {
    token: 'tok',
    userId: 'u1',
    deviceId: 'desktop-1',
    secret: 's3cret',
    name: 'Mac',
  }

  let playbackSync: typeof import('@/services/playbackSync').playbackSync

  /**
   * Start the socket on a given platform.
   *
   * The module registry is reset first so `Platform.OS` is set on the SAME
   * react-native instance the service will import — a value read from the
   * previous registry is a different object and the branch under test would
   * never be reached.
   */
  const connectOn = (platform: string, session: Record<string, unknown>) => {
    jest.resetModules()
    require('react-native').Platform.OS = platform
    playbackSync = require('@/services/playbackSync').playbackSync
    playbackSync.start(session as never, () => undefined)
  }

  beforeEach(() => {
    opened.length = 0
    ;(globalThis as {WebSocket?: unknown}).WebSocket = FakeSocket
  })

  afterEach(() => {
    playbackSync?.stop()
  })

  it('carries the credentials in the query string on the web', () => {
    connectOn('web', session)

    expect(opened).toHaveLength(1)
    const url = new URL(opened[0].url)
    expect(url.searchParams.get('token')).toBe('tok')
    expect(url.searchParams.get('user')).toBe('u1')
    expect(url.searchParams.get('device')).toBe('desktop-1')
    expect(url.searchParams.get('secret')).toBe('s3cret')
    // ...and nothing after the url, because the browser would drop it anyway
    expect(opened[0].args).toEqual([])
  })

  it('sends them as headers on a native build, and keeps the url bare', () => {
    connectOn('ios', session)

    expect(opened).toHaveLength(1)
    expect(opened[0].url).not.toContain('token=')
    expect(opened[0].args[1]).toEqual({
      headers: {
        'x-auth-token': 'tok',
        'x-auth-user': 'u1',
        'x-auth-device': 'desktop-1',
        'x-auth-secret': 's3cret',
      },
    })
  })

  it('omits the secret when the session has none', () => {
    connectOn('web', {token: 'tok', userId: 'u1', deviceId: 'd'})

    expect(new URL(opened[0].url).searchParams.has('secret')).toBe(false)
  })
})
