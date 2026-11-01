#!/usr/bin/env node
/**
 * The half of a release that used to be clicks: version record, release notes,
 * build, submission.
 *
 * `deploy-ios-local.sh` and `build-desktop-mas.sh` end the moment Apple has the
 * binary, and say so — a build sitting in TestFlight is not a release. What
 * came after was a browser: create the version, type What's New, pick the
 * build, press Submit. Four steps, two platforms, and every one of them a place
 * to ship the wrong build or forget the notes.
 *
 * This is those four steps against the App Store Connect API.
 *
 * Usage:
 *   asc-release.js ios   --notes "..."        # prepare and submit for review
 *   asc-release.js macos --notes-file FILE
 *   asc-release.js ios   --no-submit          # stop once the build is attached
 *   asc-release.js ios   --dry-run            # say what it would do, do nothing
 *   asc-release.js ios   --version 1.5.52     # default: the api's version
 *   asc-release.js ios   --manual-release     # hold for a manual release click
 *
 * WAITING IS THE DEFAULT. Apple takes 5-30 minutes to process an upload and the
 * build simply does not exist to the API until it has. Polling here means
 * `make submit` can follow `make ios` on the same line instead of being a thing
 * you come back to. `--no-wait` fails immediately instead.
 *
 * NOTHING IS RELEASED TO USERS BY THIS SCRIPT. It submits to review; the
 * version's own release type decides what happens after approval, and the app's
 * availability decides whether that reaches anyone at all. Both stay where they
 * are unless you pass --manual-release.
 */
const fs = require('fs')
const path = require('path')
const { APP_ID, get, post, patch, query } = require('./asc-api')

const ROOT = path.join(__dirname, '..', '..')

const PLATFORMS = { ios: 'IOS', macos: 'MAC_OS', mac: 'MAC_OS' }

/**
 * The states in which Apple still lets a version be changed.
 *
 * Everything else — WAITING_FOR_REVIEW, IN_REVIEW, READY_FOR_DISTRIBUTION — is
 * a version that has left your hands, and attaching a build to one fails deep
 * in the call with a message about relationships rather than about state. Worth
 * checking up front so the error names the real problem.
 */
const EDITABLE = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
])

const WAIT_TIMEOUT_MS = Number(process.env.ASC_WAIT_TIMEOUT_MS || 45 * 60 * 1000)
const WAIT_POLL_MS = Number(process.env.ASC_WAIT_POLL_MS || 30 * 1000)

const log = (message) => console.log(message)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function die(message) {
  console.error(`asc-release: ${message}`)
  process.exit(1)
}

// --- the command line ------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    platform: null,
    version: null,
    notes: null,
    submit: true,
    wait: true,
    dryRun: false,
    releaseType: 'AFTER_APPROVAL',
  }
  const rest = [...argv]
  while (rest.length) {
    const arg = rest.shift()
    switch (arg) {
      case '--notes': opts.notes = rest.shift(); break
      case '--notes-file': {
        const file = rest.shift()
        if (!file || !fs.existsSync(file)) die(`no notes file at ${file ?? '(nothing)'}`)
        opts.notes = fs.readFileSync(file, 'utf8').trim()
        break
      }
      case '--version': opts.version = rest.shift(); break
      case '--no-submit': opts.submit = false; break
      case '--no-wait': opts.wait = false; break
      case '--dry-run': opts.dryRun = true; break
      case '--manual-release': opts.releaseType = 'MANUAL'; break
      case '-h': case '--help':
        console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 33).join('\n'))
        process.exit(0)
        break
      default:
        if (arg.startsWith('-')) die(`unknown option ${arg}`)
        if (opts.platform) die(`two platforms given: ${opts.platform} and ${arg}`)
        opts.platform = arg
    }
  }
  if (!opts.platform) die('usage: asc-release.js <ios|macos> [--notes "..."] (see --help)')
  const platform = PLATFORMS[opts.platform.toLowerCase()]
  if (!platform) die(`unknown platform "${opts.platform}" — expected ios or macos`)
  opts.platform = platform

  // The api is the source of the version for every component; see
  // scripts/sync-version.sh for why the frontends carry the backend's number.
  if (!opts.version) {
    opts.version = require(path.join(ROOT, 'api', 'package.json')).version
  }
  return opts
}

// --- the build -------------------------------------------------------------

/**
 * The newest processed build of this marketing version, waiting for it if it is
 * still being processed.
 *
 * `preReleaseVersion.version` is the MARKETING version (1.5.51) while a build's
 * own `version` is the build number (10) — the two fields have the same name on
 * either side of the relationship, which is the single most confusing thing
 * about this API.
 */
async function findBuild(platform, version, wait) {
  const path =
    `/v1/builds?` +
    query({
      'filter[app]': APP_ID,
      'filter[preReleaseVersion.version]': version,
      'filter[preReleaseVersion.platform]': platform,
      'fields[builds]': 'version,processingState,uploadedDate',
      sort: '-version',
      limit: 20,
    })

  const deadline = Date.now() + WAIT_TIMEOUT_MS
  let announced = false

  for (;;) {
    const builds = (await get(path)).data || []
    const valid = builds.filter((b) => b.attributes.processingState === 'VALID')
    if (valid.length) return valid[0]

    const processing = builds.filter((b) => b.attributes.processingState === 'PROCESSING')
    const failed = builds.filter((b) =>
      ['FAILED', 'INVALID'].includes(b.attributes.processingState),
    )

    if (!builds.length) {
      die(
        `App Store Connect has no ${platform} build of ${version}. ` +
          `Upload one first (make ios --local / make desktop --mas --upload).`,
      )
    }
    if (!processing.length) {
      die(
        `no usable ${platform} build of ${version}: ` +
          failed.map((b) => `${b.attributes.version} is ${b.attributes.processingState}`).join(', '),
      )
    }
    if (!wait) {
      die(`build ${processing[0].attributes.version} is still PROCESSING (drop --no-wait to wait)`)
    }
    if (Date.now() > deadline) {
      die(`build ${processing[0].attributes.version} was still PROCESSING after the timeout`)
    }
    if (!announced) {
      log(`    build ${processing[0].attributes.version} is still processing — waiting`)
      announced = true
    }
    await sleep(WAIT_POLL_MS)
  }
}

// --- the version record ----------------------------------------------------

async function findVersion(platform, version) {
  const found = await get(
    `/v1/apps/${APP_ID}/appStoreVersions?` +
      query({
        'filter[platform]': platform,
        'filter[versionString]': version,
        'fields[appStoreVersions]': 'versionString,appStoreState,releaseType,copyright',
        limit: 1,
      }),
  )
  return (found.data || [])[0] || null
}

/** The copyright line, carried over so a new version is not born incomplete. */
async function previousCopyright(platform) {
  const found = await get(
    `/v1/apps/${APP_ID}/appStoreVersions?` +
      query({
        'filter[platform]': platform,
        'fields[appStoreVersions]': 'copyright',
        limit: 10,
      }),
  )
  for (const version of found.data || []) {
    if (version.attributes.copyright) return version.attributes.copyright
  }
  return null
}

async function createVersion(platform, version, releaseType) {
  const copyright = await previousCopyright(platform)
  const created = await post('/v1/appStoreVersions', {
    data: {
      type: 'appStoreVersions',
      attributes: { platform, versionString: version, releaseType, ...(copyright ? { copyright } : {}) },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  })
  return created.data
}

/**
 * What's New, on every localization the version has.
 *
 * Apple requires it on an update and leaves it EMPTY on a new version record —
 * the rest of the metadata is inherited from the previous version, this one
 * field never is. A single-locale app makes "every localization" one row; the
 * loop is there so adding a second language does not quietly ship English
 * release notes under a Russian listing.
 */
async function setNotes(versionId, notes) {
  const localizations = await get(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?` +
      query({ 'fields[appStoreVersionLocalizations]': 'locale,whatsNew', limit: 50 }),
  )
  const rows = localizations.data || []
  if (!rows.length) die('the version has no localizations to put the release notes on')

  for (const row of rows) {
    await patch(`/v1/appStoreVersionLocalizations/${row.id}`, {
      data: { type: 'appStoreVersionLocalizations', id: row.id, attributes: { whatsNew: notes } },
    })
  }
  return rows.map((r) => r.attributes.locale)
}

async function notesAreMissing(versionId) {
  const localizations = await get(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?` +
      query({ 'fields[appStoreVersionLocalizations]': 'locale,whatsNew', limit: 50 }),
  )
  return (localizations.data || []).some((r) => !(r.attributes.whatsNew || '').trim())
}

const attachBuild = (versionId, buildId) =>
  patch(`/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: 'builds', id: buildId },
  })

// --- the submission --------------------------------------------------------

/**
 * Submit the version for review, reusing an open submission when there is one.
 *
 * A submission is a container: it is created, items are added to it, and only
 * then is it sent. Creating a second one while the first is still open is
 * rejected, and the first is exactly what you want anyway — it is the thread
 * the reviewer's messages hang on.
 */
async function submitForReview(platform, versionId) {
  const open = await get(
    `/v1/reviewSubmissions?` +
      query({
        'filter[app]': APP_ID,
        'filter[platform]': platform,
        'filter[state]': 'READY_FOR_REVIEW',
        limit: 1,
      }),
  )

  let submission = (open.data || [])[0]
  if (submission) {
    log(`    reusing the open submission ${submission.id}`)
  } else {
    const created = await post('/v1/reviewSubmissions', {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    })
    submission = created.data
  }

  const items = await get(
    `/v1/reviewSubmissions/${submission.id}/items?` + query({ limit: 50 }),
  )
  const already = (items.data || []).some(
    (item) => item.relationships?.appStoreVersion?.data?.id === versionId,
  )

  if (already) {
    log('    the version is already an item on that submission')
  } else {
    await post('/v1/reviewSubmissionItems', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
        },
      },
    })
  }

  await patch(`/v1/reviewSubmissions/${submission.id}`, {
    data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } },
  })
  return submission.id
}

// --- the run ---------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const label = opts.platform === 'IOS' ? 'iOS' : 'macOS'

  log(`==> ${label} ${opts.version}${opts.dryRun ? '  (dry run)' : ''}`)

  const build = await findBuild(opts.platform, opts.version, opts.wait)
  log(`    build ${build.attributes.version}, uploaded ${build.attributes.uploadedDate}`)

  let version = await findVersion(opts.platform, opts.version)
  if (version && !EDITABLE.has(version.attributes.appStoreState)) {
    die(
      `${label} ${opts.version} is ${version.attributes.appStoreState} and cannot be changed. ` +
        `Bump the version (make api) and build again, or cancel the submission in App Store Connect.`,
    )
  }

  if (opts.dryRun) {
    log(`    version record: ${version ? `${version.id} (${version.attributes.appStoreState})` : 'would be created'}`)
    log(`    notes:          ${opts.notes ? `${opts.notes.length} chars` : 'unchanged'}`)
    log(`    would ${opts.submit ? 'attach the build and submit for review' : 'attach the build only'}`)
    return
  }

  if (!version) {
    version = await createVersion(opts.platform, opts.version, opts.releaseType)
    log(`    created version ${opts.version} (${opts.releaseType})`)
  } else {
    log(`    version ${opts.version} exists (${version.attributes.appStoreState})`)
  }

  if (opts.notes) {
    const locales = await setNotes(version.id, opts.notes)
    log(`    release notes set for ${locales.join(', ')}`)
  } else if (await notesAreMissing(version.id)) {
    die(
      "What's New is empty and Apple requires it on an update. " +
        'Pass --notes "..." or --notes-file FILE.',
    )
  }

  await attachBuild(version.id, build.id)
  log(`    build ${build.attributes.version} attached`)

  if (!opts.submit) {
    log(`==> prepared, not submitted. Submit when ready, or rerun without --no-submit.`)
    return
  }

  const submissionId = await submitForReview(opts.platform, version.id)
  log(`==> submitted for review (submission ${submissionId})`)
  log(`    review takes up to 48h. Release after approval: ${version.attributes?.releaseType || opts.releaseType}.`)
}

main().catch((e) => die(e.message))
