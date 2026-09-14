/**
 * The API, with one link deliberately dead.
 *
 * Cases C5 and C6 are about the failure that used to stop a show in silence: a
 * VK link signed an hour ago, the track ends, the next one will not load. On a
 * healthy account that never happens on demand — the links are fresh — so the
 * only way to test the recovery is to poison one.
 *
 * This proxies EVERYTHING to the real API unchanged, and rewrites exactly one
 * field: the `url` of the track whose id is being poisoned. Nothing in
 * app/src or api/src is touched; the app simply points at this instead, through
 * EXPO_PUBLIC_API_URL, and experiences a link that 403s the way an expired one
 * does.
 *
 *   QA_POISON_ID=456263791 node qa/fixtures/poison-proxy.mjs
 *   # then build the app with EXPO_PUBLIC_API_URL=http://10.0.2.2:8787
 *
 * `--once` poisons the first response that carries the track and then stops,
 * which is what C5 wants: the recovery re-asks the API for a fresh url, and
 * that answer has to be good or nothing can prove recovery happened. Leave it
 * off for C6, where the point is that a link which keeps failing is given up on.
 */
import {createServer} from 'node:http'
import {connect} from 'node:net'
import {connect as connectTls} from 'node:tls'

const TARGET = process.env.QA_TARGET ?? 'https://visky.envarg.com'
const PORT = Number(process.env.QA_PORT ?? 8787)
const POISON_ID = String(process.env.QA_POISON_ID ?? '')
const DEAD_URL = process.env.QA_DEAD_URL ?? 'https://cdn.vk.com/qa-dead/index.m3u8'
const ONCE = process.argv.includes('--once')

if (!POISON_ID) {
  console.error('QA_POISON_ID is required — the id of the track to poison')
  process.exit(1)
}

let poisoned = 0

/** Walk anything, rewriting the url of the track we are after. */
const poison = (node) => {
  if (Array.isArray(node)) return node.map(poison)
  if (node && typeof node === 'object') {
    if (String(node.id) === POISON_ID && typeof node.url === 'string') {
      if (!ONCE || poisoned === 0) {
        poisoned += 1
        console.log(`poisoned ${POISON_ID} (${poisoned})`)
        return {...node, url: DEAD_URL}
      }
      console.log(`left ${POISON_ID} alone — already poisoned once`)
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, poison(value)]))
  }
  return node
}

createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)

  const headers = {...request.headers}
  delete headers.host
  delete headers['content-length']
  delete headers['accept-encoding'] // so the body arrives as text we can rewrite

  let upstream
  try {
    upstream = await fetch(`${TARGET}${request.url}`, {
      method: request.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      redirect: 'manual',
    })
  } catch (error) {
    console.error('upstream failed', request.url, error.message)
    response.writeHead(502).end('upstream failed')
    return
  }

  const type = upstream.headers.get('content-type') ?? ''
  const out = new Headers(upstream.headers)
  out.delete('content-encoding')
  out.delete('content-length')

  if (!type.includes('json')) {
    const body = Buffer.from(await upstream.arrayBuffer())
    response.writeHead(upstream.status, Object.fromEntries(out)).end(body)
    return
  }

  const text = await upstream.text()
  let body = text
  try {
    body = JSON.stringify(poison(JSON.parse(text)))
  } catch {
    // not the JSON we thought; pass it through rather than corrupt it
  }
  response.writeHead(upstream.status, Object.fromEntries(out)).end(body)
})
  // The app keeps a WebSocket open to the playback socket, and `fetch` cannot
  // carry an upgrade — the first one killed an earlier version of this proxy
  // outright. Piped at the TCP level instead: nothing here needs to read those
  // frames, only to stay out of their way.
  .on('upgrade', (request, clientSocket, head) => {
    const target = new URL(TARGET)
    const secure = target.protocol === 'https:'
    const port = target.port || (secure ? 443 : 80)
    const options = {host: target.hostname, port, servername: target.hostname}
    const upstream = (secure ? connectTls : connect)(options, () => {
      const headers = Object.entries(request.headers)
        .filter(([key]) => key.toLowerCase() !== 'host')
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n')
      upstream.write(
        `${request.method} ${request.url} HTTP/1.1\r\nHost: ${target.host}\r\n${headers}\r\n\r\n`,
      )
      if (head?.length) upstream.write(head)
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
    })
    // A dead socket on either side is ordinary here, and must never take the
    // proxy down with it.
    upstream.on('error', () => clientSocket.destroy())
    clientSocket.on('error', () => upstream.destroy())
  })
  .on('clientError', (_error, socket) => socket.destroy())
  .listen(PORT, () => {
  console.log(`poison proxy on :${PORT} -> ${TARGET}`)
  console.log(`poisoning track ${POISON_ID}${ONCE ? ' once' : ' every time'} with ${DEAD_URL}`)
})
