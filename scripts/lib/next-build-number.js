#!/usr/bin/env node
/**
 * The next build number, asked of the store rather than remembered locally.
 *
 * EAS did this with `appVersionSource: remote` and an autoIncrement flag. Off
 * EAS the obvious replacement is a counter file, and a counter file is exactly
 * the thing that drifts: two machines, a rebased branch, a build that failed
 * after the bump, and now the number in git disagrees with the number the store
 * has already seen. Apple and Google both reject a duplicate outright, and the
 * error arrives at the END of a long upload.
 *
 * So there is no local state. The store is the authority, because the store is
 * what enforces the constraint.
 *
 * Usage:
 *   next-build-number.js ios
 *   next-build-number.js android
 *
 * iOS reads the App Store Connect API with the key in ~/apple-signing.
 * Android reads the Play Developer API with the service-account json in certs/.
 * Prints one integer, or exits non-zero with the reason on stderr.
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const HOME = process.env.HOME
const ASC_KEY = process.env.ASC_KEY_PATH || `${HOME}/apple-signing/AuthKey_PNX776L4UV.p8`
const ASC_KEY_ID = process.env.ASC_KEY_ID || 'PNX776L4UV'
const ASC_ISSUER = process.env.ASC_ISSUER_ID || 'b0b6e5ca-3cd8-43b6-992e-5c53e65b03ae'
const ASC_APP = process.env.ASC_APP_ID || '6808513521'
const PACKAGE = process.env.ANDROID_PACKAGE || 'com.envarg.visky'

const b64url = (v) =>
  Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

function die(message) {
  console.error(`next-build-number: ${message}`)
  process.exit(1)
}

// --- iOS -------------------------------------------------------------------

function ascToken() {
  if (!fs.existsSync(ASC_KEY)) die(`no App Store Connect key at ${ASC_KEY}`)
  const now = Math.floor(Date.now() / 1000)
  const head = b64url({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' })
  const body = b64url({ iss: ASC_ISSUER, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })
  // ES256 wants the raw r||s pair; node emits DER unless told otherwise.
  const sig = crypto
    .sign('sha256', Buffer.from(`${head}.${body}`), {
      key: fs.readFileSync(ASC_KEY),
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url')
  return `${head}.${body}.${sig}`
}

async function ios() {
  // Every build the app has ever had, newest first. The highest number wins
  // regardless of which marketing version carried it: Apple's uniqueness rule
  // is per (bundle id, version) but keeping one ascending series across
  // versions costs nothing and removes a whole class of collision.
  const url =
    `https://api.appstoreconnect.apple.com/v1/builds` +
    `?filter%5Bapp%5D=${ASC_APP}&limit=200&sort=-version` +
    `&fields%5Bbuilds%5D=version`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${ascToken()}` } })
  if (!r.ok) die(`App Store Connect answered ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const json = await r.json()
  const numbers = (json.data || [])
    .map((b) => parseInt(b.attributes.version, 10))
    .filter((n) => Number.isFinite(n))
  return (numbers.length ? Math.max(...numbers) : 0) + 1
}

// --- Android ---------------------------------------------------------------

function serviceAccount() {
  const explicit = process.env.PLAY_SERVICE_ACCOUNT
  if (explicit) {
    if (!fs.existsSync(explicit)) die(`no Play service account at ${explicit}`)
    return JSON.parse(fs.readFileSync(explicit, 'utf8'))
  }
  const dir = path.join(__dirname, '..', '..', 'certs')
  const found = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^visky-.*\.json$/.test(f)).sort()
    : []
  if (!found.length) die('no Play service-account json in certs/ (set PLAY_SERVICE_ACCOUNT)')
  return JSON.parse(fs.readFileSync(path.join(dir, found[found.length - 1]), 'utf8'))
}

async function playToken() {
  const sa = serviceAccount()
  const now = Math.floor(Date.now() / 1000)
  const head = b64url({ alg: 'RS256', typ: 'JWT' })
  const body = b64url({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })
  const sig = crypto
    .sign('RSA-SHA256', Buffer.from(`${head}.${body}`), sa.private_key)
    .toString('base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${body}.${sig}`,
    }),
  })
  if (!r.ok) die(`Google token endpoint answered ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return (await r.json()).access_token
}

async function android() {
  const token = await playToken()
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`
  const auth = { Authorization: `Bearer ${token}` }

  // An edit is the only way to read the current bundles, and it is a scratch
  // object: opening one changes nothing until it is committed, and this one
  // never is.
  const edit = await fetch(`${base}/edits`, { method: 'POST', headers: auth })
  if (!edit.ok) die(`Play edits.insert answered ${edit.status}: ${(await edit.text()).slice(0, 300)}`)
  const { id } = await edit.json()

  const list = await fetch(`${base}/edits/${id}/bundles`, { headers: auth })
  const bundles = list.ok ? (await list.json()).bundles || [] : []
  await fetch(`${base}/edits/${id}`, { method: 'DELETE', headers: auth }).catch(() => {})

  const codes = bundles.map((b) => Number(b.versionCode)).filter((n) => Number.isFinite(n))
  return (codes.length ? Math.max(...codes) : 0) + 1
}

// --- entry -----------------------------------------------------------------

const platform = process.argv[2]
const run = { ios, android }[platform]
if (!run) die(`usage: next-build-number.js ios|android (got ${platform ?? 'nothing'})`)

run()
  .then((n) => console.log(n))
  .catch((e) => die(e.message))
