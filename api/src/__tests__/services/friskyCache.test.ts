// Without Postgres the metadata cache must be completely inert: the playlist is
// served exactly as VK sends it. That is the state the tests (and a bare
// `yarn dev`) run in, so it is the one worth pinning down.
import {enrich, isFriskyCacheEnabled, kick, remember, stopFriskyWorker} from '@/services/friskyCache';
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
