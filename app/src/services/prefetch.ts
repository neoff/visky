import TrackPlayer, {Track, TrackType} from 'react-native-track-player'
import {fetchTrackById} from '@/helpers/network'
import {trackKey} from '@/helpers/miscellaneous'

/**
 * Warm the next track while the current one is still playing.
 *
 * A show longer than an hour is uploaded to VK in halves, so Part 1 -> Part 2 is
 * the hand-over the listener notices most: it is the middle of one set. Two
 * things make it audible, and this module addresses both.
 *
 * 1. The queue is filled once, when the list is tapped. VK signs its m3u8 links
 *    (see `trackKey` on why a url is never an identity here), and by the time an
 *    hour of Part 1 has played, the link sitting in the queue for Part 2 has
 *    been waiting an hour. If it has aged out, the player only finds out at the
 *    moment it needs to play it — the worst possible moment. Asking for it
 *    early leaves time to fetch a fresh one and swap it into the queue.
 * 2. Even a valid link costs a DNS lookup, a TLS handshake and a manifest fetch
 *    before the first sample arrives. Pulling the manifest and the head of the
 *    first segments ahead of time warms the CDN edge, so the player's own
 *    request is served from a hot path.
 *
 * What this does NOT do is fill the player's own buffer — ExoPlayer's cache is
 * not reachable from JS. The gap gets much shorter, not provably zero.
 */

/** How close to the end of the current track the warm-up starts. */
const LEAD_SECONDS = 90

/** Media segments to touch. Two is enough to cover the player's first reads. */
const SEGMENTS = 2

/**
 * Bytes to request per segment.
 *
 * A range request, not the whole file: the point is to warm the route, and the
 * player is going to download the segment again anyway. Pulling entire segments
 * would double mobile data for the head of every track.
 */
const SEGMENT_HEAD_BYTES = 128 * 1024

const TIMEOUT_MS = 8_000

/** Keys already warmed, oldest first. Bounded — playback runs for hours. */
const warmed: string[] = []
const WARMED_LIMIT = 20

/** The key being warmed right now, so progress ticks do not pile up on it. */
let inFlight: string | null = null

export const __resetPrefetch = (): void => {
  warmed.splice(0, warmed.length)
  inFlight = null
}

const remember = (key: string): void => {
  warmed.push(key)
  if (warmed.length > WARMED_LIMIT) warmed.shift()
}

const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response | null> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {...init, signal: controller.signal})
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve a playlist entry against the manifest it came from.
 *
 * Hand-rolled because React Native's `URL` does not implement resolution
 * against a base. Anything it cannot resolve is skipped rather than guessed —
 * a warm-up that misses costs nothing, a warm-up of the wrong url costs data.
 */
const resolveUri = (base: string, uri: string): string | null => {
  if (/^https?:\/\//i.test(uri)) return uri
  const scheme = base.match(/^(https?:)\/\//i)?.[1]
  if (!scheme) return null
  if (uri.startsWith('//')) return `${scheme}${uri}`
  const origin = base.match(/^https?:\/\/[^/]+/i)?.[0]
  if (!origin) return null
  if (uri.startsWith('/')) return `${origin}${uri}`
  if (uri.startsWith('.')) return null // relative traversal: not worth guessing
  const directory = base.slice(0, base.lastIndexOf('/') + 1)
  return directory.length > origin.length ? `${directory}${uri}` : `${origin}/${uri}`
}

/** Non-comment lines of an m3u8, resolved to absolute urls. */
const entries = (manifest: string, manifestUrl: string, limit: number): string[] => {
  const out: string[] = []
  for (const raw of manifest.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const url = resolveUri(manifestUrl, line)
    if (url) out.push(url)
    if (out.length >= limit) break
  }
  return out
}

/** A master playlist lists variants, not segments; the real one is one hop in. */
const isMaster = (manifest: string): boolean => manifest.includes('#EXT-X-STREAM-INF')

/**
 * Ask the API for a fresh signed url and put it in the queue in place of the
 * stale one.
 *
 * Only ever called for a track that is NOT playing. Adding before removing
 * keeps the queue from momentarily ending after the active track, which is
 * enough for the player to decide the show is over.
 */
const refreshQueueTrack = async (index: number, track: Track): Promise<string | null> => {
  const ownerId = (track as {owner_id?: number | string}).owner_id
  if (ownerId == null || track.id == null) return null

  try {
    const fresh = (await fetchTrackById(ownerId, track.id as number | string)) as Track
    if (typeof fresh?.url !== 'string' || !fresh.url) return null

    const activeIndex = await TrackPlayer.getActiveTrackIndex()
    if (activeIndex === index) return null

    const queue = await TrackPlayer.getQueue()
    // The queue may have been rebuilt while we were on the network.
    if (trackKey(queue[index] as never) !== trackKey(track as never)) return null

    await TrackPlayer.add({...track, ...fresh, type: TrackType.HLS}, index)
    await TrackPlayer.remove(index + 1)
    console.debug('==prefetch: refreshed the stale link for', trackKey(track as never))
    return fresh.url
  } catch (error) {
    console.warn('==prefetch: could not refresh the next track', error)
    return null
  }
}

const warm = async (index: number, track: Track): Promise<void> => {
  if (typeof track.url !== 'string' || !track.url) return

  let url = track.url
  let response = await fetchWithTimeout(url, {method: 'GET'})

  // 4xx on a signed link means it aged out while Part 1 was playing. That is
  // the case worth spending a round trip on; a 5xx or a dead network is not
  // ours to fix and the player will retry on its own.
  if (!response || (response.status >= 400 && response.status < 500)) {
    const fresh = await refreshQueueTrack(index, track)
    if (!fresh) return
    url = fresh
    response = await fetchWithTimeout(url, {method: 'GET'})
  }

  if (!response?.ok) return

  let manifest = await response.text()
  let manifestUrl = url

  if (isMaster(manifest)) {
    const [variant] = entries(manifest, manifestUrl, 1)
    if (!variant) return
    const variantResponse = await fetchWithTimeout(variant, {method: 'GET'})
    if (!variantResponse?.ok) return
    manifest = await variantResponse.text()
    manifestUrl = variant
  }

  for (const segment of entries(manifest, manifestUrl, SEGMENTS)) {
    // The body is deliberately not read: the bytes are already at the edge,
    // which is the whole point, and holding them here would waste memory.
    await fetchWithTimeout(segment, {
      method: 'GET',
      headers: {Range: `bytes=0-${SEGMENT_HEAD_BYTES - 1}`},
    })
  }
}

/**
 * Called on every progress tick. Cheap and idempotent until the current track
 * is nearly over, then warms the next one exactly once.
 */
export const prefetchNextTrack = async (position: number, duration: number): Promise<void> => {
  if (!duration || duration <= 0) return
  if (duration - position > LEAD_SECONDS) return

  const index = await TrackPlayer.getActiveTrackIndex()
  if (index == null) return

  const queue = await TrackPlayer.getQueue()
  const next = queue[index + 1]
  if (!next) return

  const key = trackKey(next as never)
  if (!key || key === inFlight || warmed.includes(key)) return

  inFlight = key
  try {
    await warm(index + 1, next)
    remember(key)
  } catch (error) {
    console.warn('==prefetch: warm-up failed', error)
  } finally {
    inFlight = null
  }
}
