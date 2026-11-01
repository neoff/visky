import {
  availableUpdate,
  currentVersion,
  isNewer,
  useUpdateStore,
} from '@/store/update'

jest.mock('@/helpers/network', () => ({fetchLatestVersion: jest.fn()}))
const {fetchLatestVersion} = jest.requireMock('@/helpers/network')

/** The selector is where the decision lives; the hook is only its wrapper. */
const available = () => availableUpdate(useUpdateStore.getState())

beforeEach(() => {
  fetchLatestVersion.mockReset()
  useUpdateStore.setState({latest: null, dismissed: null})
})

/**
 * `'1.5.9' < '1.5.10'` is true as versions and false as strings, and this
 * project has shipped more than ten patches inside one minor — so a string
 * comparison would have gone quiet exactly when it started to matter.
 */
describe('comparing two releases', () => {
  it('counts the numbers, not the characters', () => {
    expect(isNewer('1.5.10', '1.5.9')).toBe(true)
    expect(isNewer('1.5.9', '1.5.10')).toBe(false)
  })

  it('answers no for the same release', () => {
    expect(isNewer('1.5.59', '1.5.59')).toBe(false)
  })

  it('reads a shorter version as zeroes', () => {
    expect(isNewer('1.6', '1.5.59')).toBe(true)
    expect(isNewer('1.5', '1.5.0')).toBe(false)
  })
})

describe('what the app has to say about its own version', () => {
  it('says nothing until the server has answered', () => {
    expect(available()).toBeNull()
  })

  it('says nothing when this build IS the release', async () => {
    fetchLatestVersion.mockResolvedValue(currentVersion)

    await useUpdateStore.getState().check()

    expect(available()).toBeNull()
  })

  it('names the release when this build is behind one', async () => {
    fetchLatestVersion.mockResolvedValue('9.9.9')

    await useUpdateStore.getState().check()

    expect(available()).toBe('9.9.9')
  })

  it('stays quiet about a release that was waved away', async () => {
    fetchLatestVersion.mockResolvedValue('9.9.9')
    await useUpdateStore.getState().check()

    useUpdateStore.getState().dismiss()

    expect(available()).toBeNull()
  })

  it('speaks up again for a release newer than the dismissed one', async () => {
    fetchLatestVersion.mockResolvedValue('9.9.9')
    await useUpdateStore.getState().check()
    useUpdateStore.getState().dismiss()

    fetchLatestVersion.mockResolvedValue('9.9.10')
    await useUpdateStore.getState().check()

    expect(available()).toBe('9.9.10')
  })

  it('keeps quiet when the server cannot be reached', async () => {
    fetchLatestVersion.mockResolvedValue(null)

    await useUpdateStore.getState().check()

    expect(available()).toBeNull()
  })
})
