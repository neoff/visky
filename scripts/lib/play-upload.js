#!/usr/bin/env node
/**
 * Upload an .aab to Google Play and put it on a track, with no EAS and no SDK.
 *
 * The Play Developer API is an EDIT model, not a POST-and-done: open an edit,
 * upload into it, assign the bundle to a track, then commit. Nothing is visible
 * to anyone until the commit, which is the useful half of the design — an
 * upload that fails halfway leaves the listing untouched.
 *
 * Auth is a service-account JWT exchanged for an access token. That is a few
 * lines of node crypto, so there is no dependency here at all.
 *
 * Usage:
 *   play-upload.js <path-to.aab> [track]      # track defaults to internal
 *
 * Reads the service account from $PLAY_SERVICE_ACCOUNT, or the newest
 * certs/visky-*.json. Package id from $ANDROID_PACKAGE.
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const PACKAGE = process.env.ANDROID_PACKAGE || 'com.envarg.visky'
const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const UPLOAD_BASE = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications'

const b64url = (v) =>
  Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

function die(message) {
  console.error(`play-upload: ${message}`)
  process.exit(1)
}

function serviceAccount() {
  const explicit = process.env.PLAY_SERVICE_ACCOUNT
  if (explicit) {
    if (!fs.existsSync(explicit)) die(`no service account at ${explicit}`)
    return JSON.parse(fs.readFileSync(explicit, 'utf8'))
  }
  const dir = path.join(__dirname, '..', '..', 'certs')
  const found = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^visky-.*\.json$/.test(f)).sort()
    : []
  if (!found.length) die('no service-account json in certs/ (set PLAY_SERVICE_ACCOUNT)')
  return JSON.parse(fs.readFileSync(path.join(dir, found[found.length - 1]), 'utf8'))
}

async function token() {
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
  if (!r.ok) die(`token endpoint answered ${r.status}: ${(await r.text()).slice(0, 300)}`)
  console.log(`    authenticated as ${sa.client_email}`)
  return (await r.json()).access_token
}

async function call(url, options, what) {
  const r = await fetch(url, options)
  if (!r.ok) {
    const text = (await r.text()).slice(0, 500)
    throw new Error(`${what} -> ${r.status}\n${text}`)
  }
  return r.status === 204 ? null : r.json()
}

async function main() {
  const aab = process.argv[2]
  const track = process.argv[3] || 'internal'
  if (!aab) die('usage: play-upload.js <path-to.aab> [track]')
  if (!fs.existsSync(aab)) die(`no such file: ${aab}`)

  const access = await token()
  const auth = { Authorization: `Bearer ${access}` }

  console.log('==> opening an edit')
  const edit = await call(`${BASE}/${PACKAGE}/edits`, { method: 'POST', headers: auth },
    'edits.insert')
  const id = edit.id

  // Any failure from here leaves the edit abandoned rather than half-applied.
  // Play expires an uncommitted edit on its own, but deleting it is tidier and
  // makes a retry's error message about the retry rather than about a stale id.
  const abandon = async () => {
    await fetch(`${BASE}/${PACKAGE}/edits/${id}`, { method: 'DELETE', headers: auth })
      .catch(() => {})
  }

  try {
    const bytes = fs.readFileSync(aab)
    console.log(`==> uploading ${path.basename(aab)} (${(bytes.length / 1048576).toFixed(1)} MB)`)
    const uploaded = await call(
      `${UPLOAD_BASE}/${PACKAGE}/edits/${id}/bundles?uploadType=media`,
      { method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: bytes },
      'bundles.upload',
    )
    const versionCode = uploaded.versionCode
    console.log(`    versionCode ${versionCode}`)

    console.log(`==> assigning to track "${track}"`)
    await call(
      `${BASE}/${PACKAGE}/edits/${id}/tracks/${track}`,
      {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track,
          releases: [{ versionCodes: [String(versionCode)], status: 'completed' }],
        }),
      },
      'tracks.update',
    )

    console.log('==> committing')
    await call(`${BASE}/${PACKAGE}/edits/${id}:commit`, { method: 'POST', headers: auth },
      'edits.commit')

    console.log(`\n==> done. versionCode ${versionCode} is live on the ${track} track.`)
  } catch (error) {
    await abandon()
    die(`${error.message}\n(the edit was abandoned, nothing reached the listing)`)
  }
}

main().catch((e) => die(e.message))
