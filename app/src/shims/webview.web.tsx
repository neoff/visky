import React, {useEffect, useRef} from 'react'
import {StyleProp, View, ViewStyle} from 'react-native'

/**
 * `react-native-webview` for the desktop build, backed by Electron's
 * `<webview>` tag.
 *
 * The one caller is the VK login screen, and it leans on four WebView
 * behaviours. Each maps onto something Electron has:
 *
 *   injectedJavaScriptBeforeContentLoaded -> the preload script, which runs
 *       before any page script, same as the RN prop promises.
 *   window.ReactNativeWebView.postMessage  -> ipcRenderer.sendToHost, surfaced
 *       here as the `ipc-message` event and reshaped into RN's
 *       {nativeEvent:{data}}.
 *   onNavigationStateChange -> did-navigate / did-navigate-in-page.
 *   onShouldStartLoadWithRequest -> will-navigate. THIS ONE IS NOT EXACT: see
 *       the note on `stop()` below.
 *
 * `incognito` becomes a per-mount partition, which is what the prop is for
 * here — the login screen wants VK cookies gone between attempts.
 */

type WebViewSource = {uri: string}

type WebViewNavigationLike = {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  navigationType: string
}

type WebViewProps = {
  source: WebViewSource
  injectedJavaScriptBeforeContentLoaded?: string
  injectedJavaScript?: string
  onMessage?: (event: {nativeEvent: {data: string}}) => void
  onShouldStartLoadWithRequest?: (request: {url: string}) => boolean
  onNavigationStateChange?: (event: WebViewNavigationLike) => void
  originWhitelist?: string[]
  incognito?: boolean
  style?: StyleProp<ViewStyle>
}

type ElectronWebViewElement = HTMLElement & {
  src: string
  preload: string
  partition: string
  stop: () => void
  loadURL: (url: string) => Promise<void>
  executeJavaScript: (code: string) => Promise<unknown>
  getURL: () => string
  getTitle: () => string
  canGoBack: () => boolean
  canGoForward: () => boolean
}

/** Set by desktop/preload.js. Absent when the bundle runs in a plain browser. */
const bridge = (globalThis as {viskyDesktop?: ViskyDesktopBridge}).viskyDesktop

type ViskyDesktopBridge = {
  webviewPreloadUrl: string
  setInjectedScript: (code: string) => Promise<void>
}

const navigationEvent = (
  element: ElectronWebViewElement,
  url: string,
  navigationType: string,
): WebViewNavigationLike => ({
  url,
  title: element.getTitle?.() ?? '',
  loading: false,
  canGoBack: element.canGoBack?.() ?? false,
  canGoForward: element.canGoForward?.() ?? false,
  navigationType,
})

export const WebView = ({
  source,
  injectedJavaScriptBeforeContentLoaded,
  injectedJavaScript,
  onMessage,
  onShouldStartLoadWithRequest,
  onNavigationStateChange,
  incognito,
  style,
}: WebViewProps) => {
  const host = useRef<View & {_nativeTag?: unknown}>(null)
  const element = useRef<ElectronWebViewElement | null>(null)
  // Props are read from the live handlers rather than captured, so a re-render
  // does not leave the DOM listeners pointing at a stale closure.
  const handlers = useRef({onMessage, onShouldStartLoadWithRequest, onNavigationStateChange})
  handlers.current = {onMessage, onShouldStartLoadWithRequest, onNavigationStateChange}

  useEffect(() => {
    if (!bridge) {
      console.warn('==webview: no desktop bridge — VK login needs the Electron shell')
      return
    }

    // RN Web renders a View as a plain div, which is the mount point.
    const container = host.current as unknown as HTMLElement | null
    if (!container) return

    const view = document.createElement('webview') as ElectronWebViewElement
    view.setAttribute('style', 'width:100%;height:100%;border:0;display:flex;')
    view.preload = bridge.webviewPreloadUrl
    if (incognito) {
      // A partition that is neither reused nor persisted: fresh cookies per
      // mount, which is what `incognito` buys on the native side.
      view.partition = `visky-login-${Date.now()}`
    }

    const onIpc = (event: Event) => {
      const {channel, args} = event as Event & {channel: string; args: unknown[]}
      if (channel !== 'visky:postMessage') return
      handlers.current.onMessage?.({nativeEvent: {data: String(args?.[0] ?? '')}})
    }

    const onWillNavigate = (event: Event) => {
      const url = (event as Event & {url?: string}).url ?? ''
      const allowed = handlers.current.onShouldStartLoadWithRequest?.({url}) ?? true
      // Electron's <webview> will-navigate is NOT cancellable from the host, so
      // a refusal is enforced by stopping the load that just started. The
      // refused page can flash for a frame; the alternative is intercepting in
      // the main process, which cannot ask this React component for a verdict.
      if (!allowed) view.stop()
    }

    const onDidNavigate = (event: Event) => {
      const url = (event as Event & {url?: string}).url ?? view.getURL()
      handlers.current.onNavigationStateChange?.(navigationEvent(view, url, 'other'))
    }

    const onDomReady = () => {
      if (injectedJavaScript) void view.executeJavaScript(injectedJavaScript)
    }

    view.addEventListener('ipc-message', onIpc)
    view.addEventListener('will-navigate', onWillNavigate)
    view.addEventListener('did-navigate', onDidNavigate)
    view.addEventListener('did-navigate-in-page', onDidNavigate)
    view.addEventListener('dom-ready', onDomReady)

    element.current = view

    // The before-content script has to be in place BEFORE the first load, so
    // the src is only attached once the main process has taken it.
    const code = injectedJavaScriptBeforeContentLoaded ?? ''
    void bridge.setInjectedScript(code).then(() => {
      view.src = source.uri
      container.appendChild(view)
    })

    return () => {
      view.removeEventListener('ipc-message', onIpc)
      view.removeEventListener('will-navigate', onWillNavigate)
      view.removeEventListener('did-navigate', onDidNavigate)
      view.removeEventListener('did-navigate-in-page', onDidNavigate)
      view.removeEventListener('dom-ready', onDomReady)
      view.remove()
      element.current = null
    }
    // A new uri means a new login attempt, and that wants a clean webview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.uri])

  return <View ref={host} style={style} />
}

export default WebView
