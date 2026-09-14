/**
 * Talk to the app's JavaScript, from here.
 *
 * A debug build is attached to Metro, and Metro proxies the Hermes inspector —
 * which means the running app has a Chrome DevTools Protocol endpoint and will
 * evaluate an expression on request. That is the steering wheel the iOS
 * simulator otherwise does not have: no synthetic touches exist there, but the
 * app's own state is reachable, readable and (where the app exposes a handle)
 * drivable.
 *
 * Used for ASSERTIONS first and navigation second. A test that reads the
 * played store directly proves more than a screenshot of a checkmark, and it
 * cannot be fooled by a stale frame.
 *
 *   node qa/lib/cdp.mjs "iPhone Xs" 'globalThis.__DEV__'
 *   node qa/lib/cdp.mjs android     'Object.keys(globalThis).length'
 *
 * The device argument is matched loosely against the target list, so "android",
 * "iPhone" or a full device name all work.
 */
const [, , deviceMatch = '', expression = '1 + 1'] = process.argv

const targets = await (await fetch('http://localhost:8081/json/list')).json()
// "android" and "ios" are the words a test is written in; the device names
// Metro reports ("sdk_gphone64_arm64 - 14 - API 34") are not. Match either.
const wanted = deviceMatch.toLowerCase()
const alias = {
  android: ['sdk_gphone', 'emulator', 'android'],
  ios: ['iphone', 'ipad'],
  sim: ['iphone', 'ipad'],
}[wanted] ?? [wanted]

const target = targets.find((entry) => {
  const haystack = `${entry.deviceName ?? ''} ${entry.title ?? ''}`.toLowerCase()
  return alias.some((needle) => haystack.includes(needle))
})
if (!target) {
  console.error('no target matching', JSON.stringify(deviceMatch))
  console.error('available:', targets.map((t) => t.deviceName).join(' | '))
  process.exit(1)
}

// Metro's inspector proxy answers 401 to a handshake with no Origin, and the
// global WebSocket cannot set one — hence the package, borrowed from the app's
// own node_modules rather than added as a dependency of the tests.
const {createRequire} = await import('node:module')
const require = createRequire(import.meta.url)
const WebSocketWithHeaders = require('../../app/node_modules/ws')

const socket = new WebSocketWithHeaders(target.webSocketDebuggerUrl, {
  origin: 'http://localhost:8081',
})
const pending = new Map()
let nextId = 1

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, {resolve, reject})
    socket.send(JSON.stringify({id, method, params}))
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out`))
    }, 15_000)
  })

socket.on('message', (data) => {
  const message = JSON.parse(String(data))
  if (message.id && pending.has(message.id)) {
    const {resolve, reject} = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
  }
})

socket.on('error', (error) => {
  console.error('socket error:', error.message)
  process.exit(1)
})

await new Promise((resolve) => socket.on('open', resolve))

try {
  await send('Runtime.enable')
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    // The app's own globals, not an isolated world: the point is to touch the
    // same objects the app is using.
    includeCommandLineAPI: false,
  })
  if (result.exceptionDetails) {
    console.error('threw:', JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails))
    process.exit(2)
  }
  const value = result.result?.value
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 1))
} finally {
  socket.close()
}
