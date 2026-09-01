import {AuthFragments} from '@/types/auth'
import {webPlayerUrl} from '@/constants'

/**
 * Moving a signed-in session from the phone to the browser.
 *
 * A browser cannot perform the VK login at all: the grant is a legacy Android
 * password flow, and VK challenges it from any address that is not a phone (see
 * docs/02 — the cluster's IP is flagged, which is why the WebView performs the
 * grant on the device). So the web player does not log in. It is HANDED a
 * session that the phone already holds.
 *
 * The payload is a link with the credentials in its FRAGMENT, deliberately:
 *
 *   https://frisky.envarg.com/player/#access_token=..&secret=..&user_id=..
 *
 *  - a fragment is never sent to a server, not by the browser and not by any
 *    proxy in between, so opening the link leaks nothing over the wire;
 *  - it is the same shape VK's own implicit flow returns, so a token copied
 *    from anywhere else pastes in and works;
 *  - clicking it on the target machine IS the login — no typing.
 *
 * `device_id` is NOT carried over, and that is not an oversight. It is this
 * installation's playback identity: two devices sharing one id would collide in
 * the "Play on" list and a transfer would address both. The browser mints its
 * own on first run.
 *
 * What this payload is, in plain terms: a full handover of the account. It does
 * not expire on its own — it lives as long as the VK token does. Treat a copied
 * link like the password it stands in for.
 */

/** Fields we are willing to move between devices. */
const CARRIED = ['access_token', 'secret', 'user_id', 'expires_in'] as const

export const buildAuthPayload = (session: AuthFragments | null): string | null => {
  if (!session?.access_token || !session?.secret || !session?.user_id) return null

  const fragment = new URLSearchParams()
  fragment.set('access_token', session.access_token)
  fragment.set('secret', session.secret)
  fragment.set('user_id', String(session.user_id))

  // Only when the session actually knows: an invented lifetime would have the
  // receiver drop a token that is still good.
  const expiresIn = remainingSeconds(session)
  if (expiresIn != null) fragment.set('expires_in', String(expiresIn))

  return `${webPlayerUrl}/#${fragment.toString()}`
}

const remainingSeconds = (session: AuthFragments): number | null => {
  if (typeof session.maxAge === 'number' && session.maxAge > 0) {
    return Math.round(session.maxAge / 1000)
  }
  if (session.expires) {
    const left = new Date(session.expires).getTime() - Date.now()
    if (Number.isFinite(left) && left > 0) return Math.round(left / 1000)
  }
  return null
}

/**
 * The reverse, and forgiving on purpose — it has to accept whatever the user
 * managed to paste: our own link, VK's `oauth.vk.com/blank.html#access_token=…`,
 * a query string instead of a fragment, or the bare `access_token=…&secret=…`
 * with the URL lost somewhere between two chat apps.
 */
export const parseAuthPayload = (input: string): AuthFragments | null => {
  const text = input.trim()
  if (!text) return null

  // Take the LAST separator: our link carries the credentials after `#`, and a
  // pasted VK link can have both `?` and `#`.
  const start = Math.max(text.lastIndexOf('#'), text.lastIndexOf('?'))
  const raw = start >= 0 ? text.slice(start + 1) : text

  let params: URLSearchParams
  try {
    params = new URLSearchParams(raw)
  } catch {
    return null
  }

  const access_token = params.get('access_token')?.trim()
  const secret = params.get('secret')?.trim()
  const user_id = params.get('user_id')?.trim()

  // The API signs every VK call with token AND secret; a token alone reads as a
  // valid login here and then fails on the first request, which is a far more
  // confusing failure than refusing it now.
  if (!access_token || !secret || !user_id) return null

  const session: AuthFragments = {access_token, secret, user_id}

  const expiresIn = Number(params.get('expires_in'))
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    session.created = new Date()
    session.maxAge = expiresIn * 1000
    session.expires = new Date(Date.now() + expiresIn * 1000)
  }

  return session
}

/** What is missing, for a message the user can act on. */
export const describePayloadProblem = (input: string): string => {
  const text = input.trim()
  if (!text) return 'Nothing to read yet.'
  if (!/access_token=/.test(text)) return 'No access_token in that — is it the whole link?'
  if (!/secret=/.test(text)) return 'That link has a token but no secret; the API cannot sign VK calls without it.'
  if (!/user_id=/.test(text)) return 'That link has no user_id.'
  return 'Could not read that link.'
}

export {CARRIED as CARRIED_FIELDS}

/**
 * The OTHER direction, and the one the UI leads with.
 *
 * A QR code only carries data one way — from the screen showing it to the camera
 * reading it. The payload above puts the credentials in the code, which forces
 * the phone to be the screen and the laptop to be the camera. That is backwards
 * in practice: desktops often have no camera, the good camera is the one in your
 * hand, and the screen you want signed in is the one you are sitting at.
 *
 * So the screen that WANTS a session shows a code instead. It cannot put
 * credentials in it — it has none — so the code is a POINTER to a slot the API
 * is holding open, and the phone posts the session into that slot (see
 * api/src/services/pairing.ts).
 *
 * The link points at the web player because that is a real page: scanned by a
 * phone's own camera app by mistake, it opens something instead of failing. The
 * pointer rides in the fragment for the same reason the credentials do — a
 * fragment is never sent to a server, so nothing about a pairing shows up in an
 * access log.
 */
export interface PairPointer {
  id: string
  code?: string
  /** What the waiting screen calls itself. Self-declared: shown, not trusted. */
  name?: string
}

export const buildPairingLink = (pointer: PairPointer): string => {
  const fragment = new URLSearchParams()
  fragment.set('pair', pointer.id)
  if (pointer.code) fragment.set('code', pointer.code)
  if (pointer.name) fragment.set('name', pointer.name)
  return `${webPlayerUrl}/#${fragment.toString()}`
}

/**
 * Crockford's normalisation, and the reason the alphabet skips I, L, O and U:
 * read off a screen and typed back, `0`/`O` and `1`/`I`/`l` are the same
 * character. Folding them here means a code that was read correctly and typed
 * the obvious way still works.
 */
const crockford = (input: string): string =>
  input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')

/** 128 bits of hex, as minted by the API. */
const PAIR_ID = /^[0-9a-f]{32}$/i
/** The typed fallback: eight symbols, however the user grouped them. */
const PAIR_CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/

/**
 * Forgiving in the same way `parseAuthPayload` is: it has to accept our link,
 * the bare id out of a code someone re-encoded, or eight characters read off a
 * screen and typed with a dash in the middle.
 */
export const parsePairingLink = (input: string): PairPointer | null => {
  const text = input.trim()
  if (!text) return null

  const start = Math.max(text.lastIndexOf('#'), text.lastIndexOf('?'))
  if (start >= 0) {
    const params = new URLSearchParams(text.slice(start + 1))
    const id = params.get('pair')?.trim()
    if (id) {
      return {
        id,
        code: params.get('code')?.trim() || undefined,
        name: params.get('name')?.trim() || undefined,
      }
    }
  }

  if (PAIR_ID.test(text)) return {id: text.toLowerCase()}

  const typed = crockford(text)
  if (PAIR_CODE.test(typed)) return {id: typed, code: typed}

  return null
}

/** Which of the two codes is this? Both scanners feed into one handler. */
export const readAnyCode = (
  text: string,
): {kind: 'session'; session: AuthFragments} | {kind: 'pairing'; pointer: PairPointer} | null => {
  // Credentials first: our own pairing link lives on the same origin, and a
  // session payload is the unambiguous one — it carries an access_token.
  const session = parseAuthPayload(text)
  if (session) return {kind: 'session', session}

  const pointer = parsePairingLink(text)
  if (pointer) return {kind: 'pairing', pointer}

  return null
}

/** Grouped for reading aloud, which is the only reason the short code exists. */
export const formatPairCode = (code: string): string =>
  code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
