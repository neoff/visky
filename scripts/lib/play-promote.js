#!/usr/bin/env node
/**
 * Put a bundle Play ALREADY HAS on a track, with its release notes.
 *
 * `play-upload.js` is for a .aab that exists on this machine; this is for one
 * that has already been uploaded — the internal build that was tested for a
 * week and is now the release. Nothing is built, nothing is re-uploaded: a
 * version code Play is holding is simply assigned to a track, which is what the
 * "promote" button in the console does.
 *
 * Usage:
 *   play-promote.js <versionCode> [track] [--notes-file FILE] [--fraction 0.2] [--countries all]
 *   play-promote.js 103 production --notes-file release-notes.md
 *   play-promote.js 103 production --dry-run
 *
 * `--fraction` makes it a staged rollout (`inProgress`); without it the release
 * is `completed`, i.e. everyone. The notes default to release-notes.md at the
 * repo root and are written for the listing's default language — Play rejects a
 * release note over 500 characters, so that is checked here rather than at the
 * end of a commit.
 *
 * `--countries all` (or a list: `--countries US,DE`) sets where the release is
 * available. A testing track that has never been used targets NOWHERE, and Play
 * refuses the commit with "Release in track targeting no countries" — a 403
 * that says nothing about which knob it means. On a closed track `all` is not
 * as broad as it sounds: only the testers on the list ever see it.
 *
 * Auth is the same service-account json in certs/ that play-upload.js uses.
 *
 * THE EDIT IS THE SAFETY. Play's API is transactional: everything below happens
 * inside an edit that only takes effect on commit, so a failure part-way leaves
 * the listing exactly as it was, and --dry-run deletes the edit instead of
 * committing it.
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const PACKAGE = process.env.ANDROID_PACKAGE || 'com.envarg.visky'
const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const ROOT = path.join(__dirname, '..', '..')
const DEFAULT_NOTES = path.join(ROOT, 'release-notes.md')
/** Play's own limit on a release note; hitting it is a 400 at commit time */
const NOTES_MAX = 500

const b64url = (v) =>
  Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

function die(message) {
  console.error(`play-promote: ${message}`)
  process.exit(1)
}

function serviceAccount() {
  const explicit = process.env.PLAY_SERVICE_ACCOUNT
  if (explicit) {
    if (!fs.existsSync(explicit)) die(`no service account at ${explicit}`)
    return JSON.parse(fs.readFileSync(explicit, 'utf8'))
  }
  const dir = path.join(ROOT, 'certs')
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
    // Play says WHY in the body — "app is not allowed to be published to
    // production", "release notes too long" — and the status alone says nothing
    throw new Error(`${what} -> ${r.status}\n${(await r.text()).slice(0, 600)}`)
  }
  return r.status === 204 ? {} : r.json()
}

async function main() {
  const args = process.argv.slice(2)
  let code = null
  let track = null
  let notesFile = null
  let fraction = null
  let countries = null
  let dryRun = false

  while (args.length) {
    const arg = args.shift()
    if (arg === '--notes-file') notesFile = args.shift() ?? die('--notes-file needs a value')
    else if (arg === '--fraction') fraction = Number(args.shift())
    else if (arg === '--countries') countries = (args.shift() ?? die('--countries needs a value')).trim()
    else if (arg === '--dry-run') dryRun = true
    else if (/^\d+$/.test(arg)) code = arg
    else if (!track) track = arg
    else die(`unknown argument: ${arg}`)
  }
  if (!code) die('usage: play-promote.js <versionCode> [track] [--notes-file FILE] [--fraction 0.2] [--countries all] [--dry-run]')
  track = track || 'internal'
  if (fraction !== null && !(fraction > 0 && fraction < 1)) die('--fraction must be between 0 and 1')

  const file = notesFile ? path.resolve(notesFile) : DEFAULT_NOTES
  const notes = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : ''
  if (!notes) die(`no release notes (${file})`)
  if (notes.length > NOTES_MAX) die(`release notes are ${notes.length} chars, Play allows ${NOTES_MAX}`)

  const access = await token()
  const auth = { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }
  const app = `${BASE}/${PACKAGE}`

  const edit = await call(`${app}/edits`, { method: 'POST', headers: auth }, 'edits.insert')

  // The bundle has to be one Play is holding; asking first turns "which codes
  // exist" into a list in the output instead of a 400 three calls later.
  const bundles = await call(`${app}/edits/${edit.id}/bundles`, { headers: auth }, 'bundles.list')
  const codes = (bundles.bundles ?? []).map((b) => String(b.versionCode))
  if (!codes.includes(code)) {
    await fetch(`${app}/edits/${edit.id}`, { method: 'DELETE', headers: auth })
    die(`Play has no bundle ${code} (it has ${codes.join(', ') || 'none'})`)
  }

  const details = await call(`${app}/edits/${edit.id}/details`, { headers: auth }, 'details.get')
  const language = details.defaultLanguage || 'en-US'

  const targeting =
    countries === null
      ? null
      : countries.toLowerCase() === 'all'
        ? { includeRestOfWorld: true }
        : { countries: countries.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean) }

  const release = {
    versionCodes: [code],
    status: fraction === null ? 'completed' : 'inProgress',
    releaseNotes: [{ language, text: notes }],
    ...(fraction === null ? {} : { userFraction: fraction }),
    ...(targeting === null ? {} : { countryTargeting: targeting }),
  }

  console.log(`==> ${track}: version code ${code}, ${release.status}${fraction === null ? '' : ` at ${fraction * 100}%`}`)
  console.log(`    notes[${language}] ${notes.length} chars`)
  if (targeting) {
    console.log(`    countries: ${targeting.includeRestOfWorld ? 'rest of world' : targeting.countries.join(', ')}`)
  }

  if (dryRun) {
    await fetch(`${app}/edits/${edit.id}`, { method: 'DELETE', headers: auth })
    console.log('    dry run — edit discarded, nothing changed')
    return
  }

  await call(
    `${app}/edits/${edit.id}/tracks/${track}`,
    { method: 'PUT', headers: auth, body: JSON.stringify({ track, releases: [release] }) },
    'tracks.update',
  )
  const committed = await call(`${app}/edits/${edit.id}:commit`, { method: 'POST', headers: auth }, 'edits.commit')
  console.log(`==> committed edit ${committed.id}`)
  console.log(`    ${code} is on ${track}. Play reviews it before anyone sees it.`)
}

main().catch(async (error) => {
  console.error(`play-promote: ${error.message}`)
  process.exit(1)
})
