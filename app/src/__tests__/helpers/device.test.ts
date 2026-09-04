import {Platform} from 'react-native'
import {deviceLabel} from '@/helpers/device'

/**
 * The desktop used to appear in the account's device list as "web device".
 *
 * It is a list of PLACES — a phone, a car, the laptop on the desk — and one
 * entry reading "web device" makes the list unreadable, which matters because
 * choosing the wrong row sends the sound to the wrong room.
 */
describe('deviceLabel', () => {
  const globals = globalThis as unknown as {window?: unknown}

  afterEach(() => {
    Platform.OS = 'web'
    delete globals.window
  })

  it('names the platform on a native build', () => {
    Platform.OS = 'ios'
    expect(deviceLabel()).toBe('ios device')
  })

  it('says Mac when the shell says it is a mac', () => {
    Platform.OS = 'web'
    globals.window = {viskyDesktop: {platform: 'macos', shell: 'tauri'}}
    expect(deviceLabel()).toBe('Mac')
  })

  it('says Desktop for a shell on anything else', () => {
    Platform.OS = 'web'
    globals.window = {viskyDesktop: {platform: 'linux'}}
    expect(deviceLabel()).toBe('Desktop')
  })

  it('says Browser in a plain tab, never "web device"', () => {
    Platform.OS = 'web'
    globals.window = {}
    expect(deviceLabel()).toBe('Browser')
  })
})
