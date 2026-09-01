// desktop/main.js
//
// The Electron shell around the Expo web bundle.
//
// The renderer runs exactly the same source as the phone, exported for platform
// `web` (see app/metro.config.js for the four modules that get swapped out).
// This process only supplies the three things a browser tab cannot:
//
//   1. an origin to serve the bundle from       -> the `visky://` protocol
//   2. permission to read VK's CDN from script  -> scoped CORS headers
//   3. a real embedded browser for VK login     -> <webview> plus its preload
//
'use strict'

const {app, BrowserWindow, Menu, ipcMain, protocol, session, shell} = require('electron')
const fs = require('fs/promises')
const path = require('path')
const {pathToFileURL} = require('url')

/** Where the exported Expo bundle sits, both in dev and inside the asar. */
const WEB_ROOT = path.join(__dirname, 'web')

/**
 * Hosts whose responses get an Access-Control-Allow-Origin header added.
 *
 * shaka-player fetches the HLS manifest and every media segment with XHR from
 * the `visky://` origin, and VK's CDN does not send CORS headers — without this
 * every track fails to load while the same url plays fine in a <video> tag.
 *
 * Deliberately a list and not `*`: this weakens the same-origin policy, so it
 * is spent only on the hosts that actually serve the audio. The API host is NOT
 * here — api/src/configurations/router.ts already runs `cors({origin: true})`
 * and answers preflight itself.
 */
const CORS_HOSTS = [
  '*://*.vkuseraudio.net/*',
  '*://*.vkuseraudio.com/*',
  '*://*.userapi.com/*',
  '*://*.vk-cdn.net/*',
  '*://*.vkcdn.net/*',
  '*://*.mycdn.me/*',
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

/**
 * The script the login WebView injects before page scripts run.
 *
 * It is authored in the React component (app/src/app/(auth)/login.tsx) and has
 * to be in place BEFORE the webview navigates, so it is parked here and the
 * webview's preload pulls it synchronously as its very first act.
 */
let injectedScript = ''

// A privileged scheme, registered before `ready` because that is the only
// moment Electron accepts it. `secure` is what buys the renderer localStorage
// (the MMKV shim lives there) and Media Source Extensions, which shaka needs.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'visky',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

/** Serve the exported bundle, falling back to index.html so routes deep-link. */
const serveBundle = async (request) => {
  const url = new URL(request.url)
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  const candidate = path.join(WEB_ROOT, relative)

  // Containment check: a crafted `visky://app/../../etc/passwd` must not escape
  // the bundle directory.
  const withinRoot = path
    .resolve(candidate)
    .startsWith(path.resolve(WEB_ROOT) + path.sep)

  let file = withinRoot && relative ? candidate : null
  let body = null

  if (file) {
    body = await fs.readFile(file).catch(() => null)
  }

  if (body === null) {
    // expo-router exports one index.html and routes on the client, so anything
    // that is not a real file is a route, not a 404.
    file = path.join(WEB_ROOT, 'index.html')
    body = await fs.readFile(file).catch(() => null)
  }

  if (body === null) {
    return new Response('bundle missing — run scripts/build-desktop.sh', {
      status: 500,
      headers: {'content-type': 'text/plain; charset=utf-8'},
    })
  }

  return new Response(body, {
    status: 200,
    headers: {'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'},
  })
}

const allowCorsForMediaHosts = () => {
  session.defaultSession.webRequest.onHeadersReceived({urls: CORS_HOSTS}, (details, callback) => {
    const headers = details.responseHeaders ?? {}
    // Delete before setting: VK sometimes sends its own value, and two
    // Access-Control-Allow-Origin headers are treated as invalid by Chromium.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'access-control-allow-origin') delete headers[key]
    }
    headers['Access-Control-Allow-Origin'] = ['*']
    callback({responseHeaders: headers})
  })
}

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#000000',
    title: 'visky',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The VK login screen mounts an Electron <webview>; see
      // app/src/shims/webview.web.tsx.
      webviewTag: true,
    },
  })

  window.loadURL('visky://app/')

  // A target=_blank or an external link opens in the real browser instead of a
  // second chrome-less window the user cannot navigate.
  window.webContents.setWindowOpenHandler(({url}) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return {action: 'deny'}
  })

  return window
}

const buildMenu = () => {
  // Without an explicit menu macOS gives no Cmd+Q, Cmd+W or clipboard
  // shortcuts, which makes the app feel broken in a way that has nothing to do
  // with the app itself.
  const template = [
    {
      label: app.name,
      submenu: [
        {role: 'about'},
        {type: 'separator'},
        {role: 'hide'},
        {role: 'hideOthers'},
        {role: 'unhide'},
        {type: 'separator'},
        {role: 'quit'},
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {role: 'undo'},
        {role: 'redo'},
        {type: 'separator'},
        {role: 'cut'},
        {role: 'copy'},
        {role: 'paste'},
        {role: 'selectAll'},
      ],
    },
    {
      label: 'View',
      submenu: [
        {role: 'reload'},
        {role: 'forceReload'},
        {role: 'toggleDevTools'},
        {type: 'separator'},
        {role: 'resetZoom'},
        {role: 'zoomIn'},
        {role: 'zoomOut'},
        {type: 'separator'},
        {role: 'togglefullscreen'},
      ],
    },
    {label: 'Window', submenu: [{role: 'minimize'}, {role: 'close'}]},
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  protocol.handle('visky', serveBundle)
  allowCorsForMediaHosts()
  buildMenu()

  // The renderer hands the login script over before the webview navigates...
  ipcMain.handle('visky:set-injected-script', (_event, code) => {
    injectedScript = typeof code === 'string' ? code : ''
  })
  // ...and the webview's preload takes it synchronously, so it is installed
  // before the page has run a single line of its own.
  ipcMain.on('visky:get-injected-script', (event) => {
    event.returnValue = injectedScript
  })
  // Resolved here because the renderer's preload is sandboxed and cannot
  // require `path`.
  ipcMain.on('visky:webview-preload-url', (event) => {
    event.returnValue = pathToFileURL(path.join(__dirname, 'webview-preload.js')).toString()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // The macOS convention is to stay in the dock, but this is a player with one
  // window: closing it means "done listening".
  app.quit()
})
