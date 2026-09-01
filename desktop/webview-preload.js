// desktop/webview-preload.js
//
// Runs inside the VK login <webview>, before any script belonging to the page.
// It recreates the two things react-native-webview gives the login screen.
//
// Context isolation stays ON. Turning it off would be the shorter route — the
// preload would simply share the page's globals — but it would also hand every
// page VK serves (including the captcha widget) a live ipcRenderer, and one of
// the messages that travels over it is the grant token. So the bridge is
// narrowed to a single function instead.
'use strict'

const {contextBridge, ipcRenderer} = require('electron')

// 1. window.ReactNativeWebView.postMessage — the channel the injected script
//    reports the captcha and the grant on. Reaches the host as `ipc-message`,
//    which the shim reshapes into RN's {nativeEvent:{data}}.
contextBridge.exposeInMainWorld('ReactNativeWebView', {
  postMessage: (data) => ipcRenderer.sendToHost('visky:postMessage', String(data ?? '')),
})

// 2. injectedJavaScriptBeforeContentLoaded — read SYNCHRONOUSLY, because the
//    page must not get to run first. The script has to land in the page's own
//    world: it reads navigator.userAgent and patches VK's globals, none of
//    which is visible from the preload's isolated world.
try {
  const source = ipcRenderer.sendSync('visky:get-injected-script')
  if (typeof source === 'string' && source.length > 0) {
    contextBridge.executeInMainWorld({
      func: (code) => {
        try {
          // Indirect eval: runs in global scope, the same as a <script> tag,
          // which is what the RN prop does on the native side.
          ;(0, eval)(code)
        } catch (error) {
          console.error('[visky] injected script failed', error)
        }
      },
      args: [source],
    })
  }
} catch (error) {
  console.error('[visky] could not install the injected script', error)
}
