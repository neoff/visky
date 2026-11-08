import {Track, TrackType} from 'react-native-track-player'
import {trackKey} from '@/helpers/miscellaneous'

/**
 * One part of a show, as the v2 API carries it in `part_list`. Each part is its
 * own VK upload, so it has its own ids and signed url; the duration is the part,
 * not the show.
 */
export type TrackPart = {
  owner_id?: number | string
  id?: number | string
  url?: string
  part?: number
  duration?: number
}

/**
 * A queue entry the player actually holds. In v2 a multipart show expands into
 * one of these PER PART — consecutive in the queue, so the existing prefetch
 * warms the next one and the hand-over is gapless. The extra fields let the UI
 * draw the whole show as one thing: `showKey` groups the parts, `parts` is the
 * boundary/length map, `partIndex`/`partCount` say where we are.
 */
export type PartedTrack = Track & {
  owner_id?: number | string
  part_list?: TrackPart[]
  multipart?: boolean
  showKey?: string
  parts?: TrackPart[]
  partIndex?: number
  partCount?: number
}

/** `${owner}_${id}` of a part, falling back to the row's own key. */
const partKey = (part: TrackPart, fallback: PartedTrack): string => {
  if (part.id != null) {
    return part.owner_id == null ? String(part.id) : `${part.owner_id}_${part.id}`
  }
  return trackKey(fallback as never) ?? ''
}

/**
 * The stable id of the show a track belongs to.
 *
 * For an expanded part it is the key stamped on it; for a merged list row it is
 * its first part's key; for a plain v1 track it is the track's own key. This is
 * what a list row compares against the active track to know it is the one
 * playing — never `url`, which VK re-signs on every fetch.
 */
export const showKeyOf = (track: PartedTrack | null | undefined): string | undefined => {
  if (track == null) return undefined
  if (track.showKey) return track.showKey
  const parts = track.part_list
  if (track.multipart && parts && parts.length > 0) return partKey(parts[0], track)
  return trackKey(track as never)
}

/**
 * Expand a list row into the queue entries the player should hold.
 *
 * A multipart v2 row becomes one entry per part (each with its own ids/url/
 * duration, tagged with the show it belongs to). Anything else — a single-part
 * row, or a v1 row — stays exactly one entry, so v1 is untouched.
 */
export const expandTrack = (track: PartedTrack): PartedTrack[] => {
  const parts = track.part_list
  if (!track.multipart || !parts || parts.length <= 1) {
    return [track]
  }
  const showKey = partKey(parts[0], track)
  const partCount = parts.length
  return parts.map((part, index) => ({
    ...track,
    id: (part.id ?? track.id) as never,
    owner_id: part.owner_id ?? track.owner_id,
    url: (part.url ?? track.url) as string,
    duration: Number(part.duration) || track.duration,
    type: TrackType.HLS,
    showKey,
    parts,
    partIndex: index,
    partCount,
  }))
}

/** Expand a whole list into the player's flat queue. */
export const expandTracks = (tracks: PartedTrack[]): PartedTrack[] =>
  tracks.flatMap((track) => expandTrack(track))

export type ShowProgress = {
  /** seconds into the WHOLE show (parts before + position in the active part) */
  showPosition: number
  /** the whole show's length in seconds */
  total: number
  partIndex: number
  partCount: number
  /** fractions 0..1 where a part boundary sits, for drawing dividers */
  boundaries: number[]
}

const partDurations = (track: PartedTrack): number[] =>
  (track.parts ?? []).map((part) => Number(part.duration) || 0)

/**
 * Where we are across the whole show, given the active part's local position.
 *
 * For a plain track (no parts) this is just position/duration with no
 * boundaries — so a caller can use it unconditionally.
 */
export const showProgress = (track: PartedTrack | null | undefined, position: number): ShowProgress => {
  const durations = track ? partDurations(track) : []
  if (!track || durations.length <= 1) {
    const total = Number(track?.duration) || 0
    return {showPosition: position, total, partIndex: 0, partCount: durations.length || 1, boundaries: []}
  }
  const partIndex = Math.min(Math.max(track.partIndex ?? 0, 0), durations.length - 1)
  const total = durations.reduce((sum, value) => sum + value, 0)
  let elapsedBefore = 0
  for (let index = 0; index < partIndex; index++) elapsedBefore += durations[index]

  const boundaries: number[] = []
  if (total > 0) {
    let acc = 0
    for (let index = 0; index < durations.length - 1; index++) {
      acc += durations[index]
      boundaries.push(acc / total)
    }
  }
  return {
    showPosition: elapsedBefore + position,
    total,
    partIndex,
    partCount: durations.length,
    boundaries,
  }
}

export type ShowSeekTarget = {partIndex: number; offset: number}

/**
 * Map a fraction of the whole show to the part it lands in and the offset
 * within that part. Returns null when there is nothing sensible to seek to.
 */
export const seekWithinShow = (
  fraction: number,
  track: PartedTrack | null | undefined,
): ShowSeekTarget | null => {
  const durations = track ? partDurations(track) : []
  if (durations.length <= 1) return null
  const total = durations.reduce((sum, value) => sum + value, 0)
  if (!(total > 0) || !Number.isFinite(fraction)) return null

  const target = Math.min(Math.max(fraction, 0), 1) * total
  let elapsed = 0
  for (let index = 0; index < durations.length; index++) {
    if (target < elapsed + durations[index] || index === durations.length - 1) {
      return {partIndex: index, offset: Math.max(0, target - elapsed)}
    }
    elapsed += durations[index]
  }
  return null
}

/** Whether a further part follows the one playing (drives the "→ next part" arrow). */
export const hasNextPart = (track: PartedTrack | null | undefined): boolean => {
  if (!track || !track.partCount || track.partCount <= 1) return false
  return (track.partIndex ?? 0) < track.partCount - 1
}
