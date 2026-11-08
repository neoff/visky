import {Platform} from 'react-native'
import {fetchStoreVersion} from '@/helpers/network'

/**
 * The update notice used to take its number from the api, so deploying the api
 * announced a release no store had. It asks Apple now, and nothing else.
 */
describe('fetchStoreVersion', () => {
  const realFetch = global.fetch
  const realOS = Platform.OS

  const appStore = (version: string | null) =>
    jest.fn(async () => ({
      ok: true,
      json: async () => ({resultCount: version ? 1 : 0, results: version ? [{version}] : []}),
    }))

  afterEach(() => {
    global.fetch = realFetch
    Platform.OS = realOS
  })

  it('asks Apple, not the api', async () => {
    Platform.OS = 'ios'
    const fetch = appStore('1.5.59')
    global.fetch = fetch as never

    expect(await fetchStoreVersion()).toBe('1.5.59')
    const url = String((fetch.mock.calls[0] as unknown[])[0])
    expect(url).toMatch(/^https:\/\/itunes\.apple\.com\/lookup\?/)
    expect(url).toContain('bundleId=com.envarg.visky')
    expect(url).not.toContain('entity=')
  })

  it('asks for the Mac listing on the desktop', async () => {
    Platform.OS = 'web'
    const fetch = appStore('1.5.58')
    global.fetch = fetch as never

    expect(await fetchStoreVersion()).toBe('1.5.58')
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain('entity=desktopSoftware')
  })

  it('says nothing on Android — Play has no lookup', async () => {
    Platform.OS = 'android'
    const fetch = appStore('9.9.9')
    global.fetch = fetch as never

    expect(await fetchStoreVersion()).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('says nothing when the app is not in the store or Apple is unreachable', async () => {
    Platform.OS = 'ios'
    global.fetch = appStore(null) as never
    expect(await fetchStoreVersion()).toBeNull()

    global.fetch = jest.fn(async () => {
      throw new Error('offline')
    }) as never
    expect(await fetchStoreVersion()).toBeNull()
  })
})
