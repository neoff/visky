import React, {act} from 'react'
import TestRenderer from 'react-test-renderer'

/**
 * "Невозможно двигать окно; кнопки свернуть/развернуть висят на прозрачном фоне
 * и налазят на надписи."
 *
 * Both shells open the window with no system title bar — Tauri with
 * `TitleBarStyle::Overlay`, Electron with `titleBarStyle: 'hiddenInset'` — so
 * macOS draws the traffic lights over the page and gives back nothing: no
 * reserved space, and no region to drag by. The app has to draw that strip.
 */
const inShell = (viskyDesktop: unknown) => {
  jest.resetModules()
  const globals = globalThis as {window?: unknown}
  if (viskyDesktop === undefined) globals.window = {}
  else globals.window = {viskyDesktop}
  return require('@/components/DesktopChrome') as typeof import('@/components/DesktopChrome')
}

const strip = (Component: React.ComponentType) => {
  let tree: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(<Component />)
  })
  return tree!.toJSON() as TestRenderer.ReactTestRendererJSON | null
}

afterEach(() => {
  delete (globalThis as {window?: unknown}).window
})

describe('the desktop title bar', () => {
  it('reserves the height the traffic lights are positioned against', () => {
    const {DESKTOP_TITLEBAR_HEIGHT, isDesktopShell} = inShell({platform: 'macos', shell: 'tauri'})

    // The same 36 as TITLEBAR_HEIGHT in desktop/shell/main.rs, which is what
    // TRAFFIC_LIGHT_Y is derived from. The two have to stay in step.
    expect(isDesktopShell).toBe(true)
    expect(DESKTOP_TITLEBAR_HEIGHT).toBe(36)
  })

  it('carries the drag marker of BOTH shells', () => {
    const {DesktopTitleBar} = inShell({platform: 'macos', shell: 'tauri'})

    const node = strip(DesktopTitleBar)!

    // `-webkit-app-region` is a Chromium extension and means nothing to the
    // WKWebView the Tauri build runs in; `data-tauri-drag-region` means nothing
    // to Electron. Neither costs the other anything, so both are set.
    expect(node.props['data-tauri-drag-region']).toBe(true)
    expect(node.props.style.WebkitAppRegion).toBe('drag')
  })

  it('is a real div, because react-native-web would drop both markers', () => {
    const {DesktopTitleBar} = inShell({platform: 'macos'})

    expect(strip(DesktopTitleBar)!.type).toBe('div')
  })

  it('draws nothing in an ordinary browser tab', () => {
    const {DesktopTitleBar, DESKTOP_TITLEBAR_HEIGHT, isDesktopShell} = inShell(undefined)

    // There is no window to drag there, and the bar would be a black band
    // stealing 36px from the page.
    expect(isDesktopShell).toBe(false)
    expect(DESKTOP_TITLEBAR_HEIGHT).toBe(0)
    expect(strip(DesktopTitleBar)).toBeNull()
  })
})
