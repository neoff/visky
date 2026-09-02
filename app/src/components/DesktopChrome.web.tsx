import React from 'react'
import {colors} from '@/constants'

/**
 * The strip the desktop window is dragged by, and the plate the traffic lights
 * sit on.
 *
 * Both shells open the window with no system title bar — Tauri with
 * `TitleBarStyle::Overlay`, Electron with `titleBarStyle: 'hiddenInset'` — so
 * the close/minimise/zoom buttons float directly over whatever the app draws at
 * the top, which is how they ended up on a transparent background overlapping
 * the screen's own headings. There is also nothing left for the window manager
 * to drag by, so the app has to draw that itself.
 *
 * Rendered as a real <div> rather than a <View>, because neither of the two
 * things that make it draggable is a React Native style property and
 * react-native-web would drop both:
 *
 *   * `-webkit-app-region: drag` is a Chromium extension and means nothing to
 *     the WKWebView the Tauri build runs in;
 *   * `data-tauri-drag-region` is the attribute Tauri watches and means nothing
 *     to Electron.
 *
 * Neither costs the other anything, so both are set. NOTE for the Tauri side:
 * the attribute alone is not enough — the window's capability has to grant
 * `core:window:allow-start-dragging`, which `core:default` does NOT include,
 * or the drag is refused by the ACL with no error anywhere.
 *
 * Only in a desktop shell. In an ordinary browser tab `window.viskyDesktop` is
 * undefined, there is no window to drag, and the bar would just be a black band
 * stealing 36px from the page.
 */
export const isDesktopShell =
  typeof window !== 'undefined' &&
  Boolean((window as unknown as {viskyDesktop?: unknown}).viskyDesktop)

/** Matches TRAFFIC_LIGHT_Y in desktop/shell/main.rs — keep the two in step. */
export const DESKTOP_TITLEBAR_HEIGHT = isDesktopShell ? 36 : 0

export const DesktopTitleBar = () => {
  if (!isDesktopShell) return null

  return (
    <div
      data-tauri-drag-region
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
