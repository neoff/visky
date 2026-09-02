import React from 'react'
import {colors} from '@/constants'

/**
 * The strip the desktop window is dragged by, and the plate the traffic lights
 * sit on.
 *
 * Electron opens the window with `titleBarStyle: 'hiddenInset'`: no system
 * title bar, so the close/minimise/zoom buttons float directly over whatever
 * the app draws at the top — which is how they ended up on a transparent
 * background overlapping the screen's own text — and no region for the window
 * manager to drag. macOS only drags by an area marked `-webkit-app-region:
 * drag`, so the app has to draw one itself.
 *
 * Rendered as a real <div> rather than a <View>: `WebkitAppRegion` is not a
 * React Native style property and react-native-web would drop it.
 *
 * Only in the Electron shell. In an ordinary browser tab `window.viskyDesktop`
 * is undefined, there is no window to drag, and the bar would just be a black
 * band stealing 36px from the page.
 */
export const isDesktopShell =
  typeof window !== 'undefined' &&
  Boolean((window as unknown as {viskyDesktop?: unknown}).viskyDesktop)

/** Matches `trafficLightPosition` in desktop/main.js — keep the two in step. */
export const DESKTOP_TITLEBAR_HEIGHT = isDesktopShell ? 36 : 0

export const DesktopTitleBar = () => {
  if (!isDesktopShell) return null

  return (
    <div
      style={
        {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: DESKTOP_TITLEBAR_HEIGHT,
          backgroundColor: colors.background,
          // The whole strip drags the window...
          WebkitAppRegion: 'drag',
          // ...and nothing in it should swallow a click meant for the page
          // below, because the strip covers the full width.
          WebkitUserSelect: 'none',
          userSelect: 'none',
          zIndex: 1000,
        } as React.CSSProperties
      }
    />
  )
}
