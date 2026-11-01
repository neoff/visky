/**
 * The App Store Connect API, with the two awkward parts done once.
 *
 * THE TOKEN. Apple wants an ES256 JWT signed with the .p8 key, and node's
 * default signature encoding is DER — which Apple rejects with a bare 401 and
 * no hint. `dsaEncoding: 'ieee-p1363'` is the raw r||s pair it actually wants.
 * The token is minted per process and reused; ten minutes is Apple's ceiling
 * and far longer than any call here takes.
 *
 * THE ERRORS. A failed call answers with a JSON envelope whose useful part is
 * buried in `errors[].detail`, so every helper raises that text rather than the
 * status code alone. The difference between "409" and "the build is still
 * processing" is the whole of a debugging session.
 *
 * Credentials come from the same place every other Apple script here reads
 * them: the key in ~/apple-signing, overridable per environment variable. See
 * scripts/deploy-ios.sh for where the key itself comes from.
 */
const crypto = require('crypto')
const fs = require('fs')

const HOME = process.env.HOME
const KEY_PATH = process.env.ASC_KEY_PATH || `${HOME}/apple-signing/AuthKey_PNX776L4UV.p8`
const KEY_ID = process.env.ASC_KEY_ID || 'PNX776L4UV'
const ISSUER = process.env.ASC_ISSUER_ID || 'b0b6e5ca-3cd8-43b6-992e-5c53e65b03ae'

const APP_ID = process.env.ASC_APP_ID || '6808513521'
const BASE = 'https://api.appstoreconnect.apple.com'

const b64url = (v) =>
  Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

let cached = null

function token() {
  if (cached && cached.exp > Date.now() / 1000 + 30) return cached.jwt
  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(`no App Store Connect key at ${KEY_PATH} (set ASC_KEY_PATH)`)
  }
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 600
  const head = b64url({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
  const body = b64url({ iss: ISSUER, iat: now, exp, aud: 'appstoreconnect-v1' })
  const sig = crypto
    .sign('sha256', Buffer.from(`${head}.${body}`), {
      key: fs.readFileSync(KEY_PATH),
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url')
  cached = { jwt: `${head}.${body}.${sig}`, exp }
  return cached.jwt
}

/**
 * One API call. `path` is everything after the host, query string included.
 *
 * Returns the parsed body, or null for the 204 that PATCHes on relationships
 * answer with. Anything that is not 2xx throws with Apple's own wording.
 */
async function request(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const text = await response.text()
  if (!response.ok) {
    let detail = text.slice(0, 500)
    try {
      const errors = JSON.parse(text).errors || []
      if (errors.length) {
        detail = errors.map((e) => [e.title, e.detail].filter(Boolean).join(' — ')).join('; ')
      }
    } catch {
      /* not JSON; the raw body is the best there is */
    }
    throw new Error(`${method} ${path.split('?')[0]} → ${response.status}: ${detail}`)
  }
  return text ? JSON.parse(text) : null
}

const get = (path) => request('GET', path)
const post = (path, body) => request('POST', path, body)
const patch = (path, body) => request('PATCH', path, body)

/** `filter[app]=123&limit=1` without hand-encoding a square bracket every time. */
const query = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

module.exports = { APP_ID, token, request, get, post, patch, query }
