import {
  expandTrack,
  expandTracks,
  showKeyOf,
  showProgress,
  seekWithinShow,
  hasNextPart,
  type PartedTrack,
} from '@/helpers/parts'

const show = (): PartedTrack =>
  ({
    id: 11,
    owner_id: -42311167,
    url: 'u1',
    title: 'Wander',
    duration: 5400,
    multipart: true,
    part_list: [
      {owner_id: -42311167, id: 11, url: 'u1', part: 1, duration: 3600},
      {owner_id: -42311167, id: 12, url: 'u2', part: 2, duration: 1800},
    ],
  } as PartedTrack)

const single = (): PartedTrack =>
  ({id: 5, owner_id: -42311167, url: 'u', title: 'Solo', duration: 3000, multipart: false} as PartedTrack)

describe('expandTrack', () => {
  it('splits a multipart row into one real queue entry per part', () => {
    const parts = expandTrack(show())
    expect(parts).toHaveLength(2)
    expect(parts.map((p) => p.id)).toEqual([11, 12])
    expect(parts.map((p) => p.url)).toEqual(['u1', 'u2'])
    expect(parts.map((p) => p.duration)).toEqual([3600, 1800])
    expect(parts.map((p) => p.partIndex)).toEqual([0, 1])
    // every part is tagged with the same show, so the list row can match it
    expect(new Set(parts.map((p) => p.showKey)).size).toBe(1)
    expect(parts[0].showKey).toBe('-42311167_11')
    expect(parts.every((p) => p.partCount === 2)).toBe(true)
  })

  it('leaves a single-part row as itself (v1 untouched)', () => {
    expect(expandTrack(single())).toEqual([single()])
  })

  it('leaves a multipart flag with only one part as a single entry', () => {
    const odd = {...single(), multipart: true, part_list: [{id: 5, url: 'u', part: 1, duration: 3000}]} as PartedTrack
    expect(expandTrack(odd)).toHaveLength(1)
  })
})

describe('expandTracks', () => {
  it('flattens a mixed list', () => {
    expect(expandTracks([single(), show()])).toHaveLength(3)
  })
})

describe('showKeyOf', () => {
  it('is the first part for a merged row', () => {
    expect(showKeyOf(show())).toBe('-42311167_11')
  })
  it('is the stamped key for an expanded part', () => {
    const [, part2] = expandTrack(show())
    expect(showKeyOf(part2)).toBe('-42311167_11')
  })
  it('is the track key for a plain track', () => {
    expect(showKeyOf(single())).toBe('-42311167_5')
  })
  it('is undefined for nothing', () => {
    expect(showKeyOf(undefined)).toBeUndefined()
  })
})

describe('showProgress', () => {
  it('maps the second part onto whole-show time', () => {
    const [, part2] = expandTrack(show())
    // 600s into Part 2 => 3600 + 600 across a 5400s show
    const sp = showProgress(part2, 600)
    expect(sp.total).toBe(5400)
    expect(sp.showPosition).toBe(4200)
    expect(sp.partIndex).toBe(1)
    expect(sp.partCount).toBe(2)
    // one boundary, at the end of Part 1
    expect(sp.boundaries).toEqual([3600 / 5400])
  })

  it('is plain position/duration for a single track', () => {
    const sp = showProgress(single(), 120)
    expect(sp.showPosition).toBe(120)
    expect(sp.total).toBe(3000)
    expect(sp.boundaries).toEqual([])
  })
})

describe('seekWithinShow', () => {
  it('lands a fraction in the right part with the right offset', () => {
    const track = expandTrack(show())[0]
    // 50% of 5400 = 2700, still inside Part 1 (3600)
    expect(seekWithinShow(0.5, track)).toEqual({partIndex: 0, offset: 2700})
    // 80% of 5400 = 4320 => Part 2, 4320 - 3600 = 720
    expect(seekWithinShow(0.8, track)).toEqual({partIndex: 1, offset: 720})
  })

  it('returns null for a single track', () => {
    expect(seekWithinShow(0.5, single())).toBeNull()
  })
})

describe('hasNextPart', () => {
  it('is true on Part 1 of a two-part show, false on Part 2', () => {
    const [p1, p2] = expandTrack(show())
    expect(hasNextPart(p1)).toBe(true)
    expect(hasNextPart(p2)).toBe(false)
  })
  it('is false for a single track', () => {
    expect(hasNextPart(single())).toBe(false)
  })
})
