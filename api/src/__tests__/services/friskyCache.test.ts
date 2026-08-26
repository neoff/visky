// Without Postgres the metadata cache must be completely inert: the playlist is
// served exactly as VK sends it. That is the state the tests (and a bare
// `yarn dev`) run in, so it is the one worth pinning down.
import {
  enrich,
  isFriskyCacheEnabled,
  isPartMarker,
  kick,
  remember,
  stopFriskyWorker,
  usableTrackList,
} from '@/services/friskyCache';
import {TrackItem} from '@/__genedated__/openapi/vk';

const track = (id: number): TrackItem => ({
  id,
  owner_id: -42311167,
  type: TrackItem.type.HLS,
  url: 'https://cs9.vkuseraudio.net/index.m3u8?siren=1',
  title: 'FRISKY | Tech Coast Tribal August 2026 - Part 1',
  artist: 'El Reyalto',
  date: 1756000000,
  duration: 3600,
});

describe('frisky metadata cache with no database', () => {
  afterAll(() => stopFriskyWorker());

  it('is off when DB_HOST is unset', () => {
    expect(isFriskyCacheEnabled()).toBe(false);
  });

  it('returns the items untouched', async () => {
    const items = [track(1), track(2)];
    await expect(enrich(items)).resolves.toBe(items);
  });

  it('swallows an empty list', async () => {
    await expect(enrich([])).resolves.toEqual([]);
  });

  it('never throws from remember() or kick()', () => {
    expect(() => remember([{id: 1, owner_id: -42311167, artist: 'El Reyalto', title: 'x'}])).not.toThrow();
    expect(() => remember(undefined)).not.toThrow();
    expect(() => remember([])).not.toThrow();
    expect(() => kick()).not.toThrow();
  });
});

// A broadcast is cut into pieces on both sides — VK caps a track at an hour,
// frisky splits for its own reasons — so the tracklist has to be read off the
// EPISODE. These two decide which piece's list is the real one.
describe('reading a tracklist off an episode', () => {
  it('treats a lone "Part 2" row as no tracklist at all', () => {
    // what frisky actually serves for the second piece of Hurly Burly, May 2026
    expect(isPartMarker([{title: 'Part 2', artist: 'HURLY BURLY'}])).toBe(true);
    expect(isPartMarker([{title: 'part 1'}, {title: 'Part 2'}])).toBe(true);
    expect(usableTrackList([{title: 'Part 2', artist: 'HURLY BURLY'}])).toEqual([]);
  });

  it('keeps a real tracklist, including one that merely mentions a part', () => {
    const real = [{title: 'Mirrors', artist: 'Moire'}, {title: 'Corone', artist: 'Good Guy Mikesh'}];
    expect(isPartMarker(real)).toBe(false);
    expect(usableTrackList(real)).toBe(real);
    expect(isPartMarker([{title: 'Sonder Part 1', artist: 'Graham Dunn'}])).toBe(false);
  });

  it('says nothing is there for an empty or missing list', () => {
    expect(isPartMarker([])).toBe(false);
    expect(usableTrackList(undefined)).toEqual([]);
    expect(usableTrackList([])).toEqual([]);
  });
});
