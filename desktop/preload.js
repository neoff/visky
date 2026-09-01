// desktop/preload.js
//
// Runs in the renderer that hosts the Expo bundle, with context isolation on
// AND the default sandbox on. Everything the bundle is allowed to ask of the
// shell goes through here, and nothing else is reachable — the renderer has no
// `require` and no ipcRenderer of its own.
//
// A sandboxed preload may only require `electron`, `events`, `timers` and
// `url`. That is not a detail to work around: requiring `path` here threw
// "module not found: path", which aborts the WHOLE preload, so `viskyDesktop`
// silently never appeared and VK login had no bridge. Anything needing the
// filesystem is therefore computed in the main process and fetched over IPC.
'use strict'

const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('viskyDesktop', {
  /**
   * The preload the login <webview> mounts with — a file: url built in main,
   * where `path` actually exists.
   */
  webviewPreloadUrl: ipcRenderer.sendSync('visky:webview-preload-url'),

  /**
   * Park the login page's before-content script in the main process.
   *
   * Ordering is the whole point: the webview's own preload reads it back
   * synchronously, so it must be here before the webview is given a src.
   */
  setInjectedScript: (code) => ipcRenderer.invoke('visky:set-injected-script', String(code ?? '')),

  /** Lets the app tell the desktop build apart from a browser tab. */
  platform: 'macos',
})
