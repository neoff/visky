/**
 * The desktop window's chrome. Nothing on a phone.
 *
 * The Electron shell hides the macOS title bar (`titleBarStyle: 'hiddenInset'`)
 * so the artwork runs to the top edge — which also means there is no bar left
 * for the traffic lights to sit on and nothing to grab the window by. The web
 * build supplies both; see DesktopChrome.web.tsx. This file is what the iOS and
 * Android bundles resolve to, and it deliberately costs them nothing.
 */
export const DESKTOP_TITLEBAR_HEIGHT = 0

export const isDesktopShell = false

export const DesktopTitleBar = (): null => null
