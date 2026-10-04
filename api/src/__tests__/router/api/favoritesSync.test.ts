/**
 * POST /api/playlist/frisky/favorites/sync — the sweep.
 *
 * "если выбрать вкладку all нужно просканировать избранное и добавить в
 * playlist frisky все композиции группы frisky radio которые были в all, в
 * порядке добавления."
 *
 * Years of hearts landed in the VK library itself, before this app kept a
 * playlist of them, and the Favorites tab only ever shows the playlist. These
 * tests pin the three things that make the sweep safe to run on every visit:
 * it adds only what the CACHE says is the group's, it adds nothing twice, and
 * it says nothing is frisky when it cannot tell.
 */
import request from 'supertest';

jest.mock('@/helper/vk', () => ({
  vkMethod: jest.fn(),
  // the real guard restores the session from the x-auth-* headers; the handler
  // addresses VK as that user, so the fake has to leave one behind
  checkAuthAndroid: jest.fn((req: any, res: any, next: any) => {
    // Assigned INTO the express-session object, never over it: replacing it
    // takes `save()` with it and the response never finishes.
    Object.assign(req.session, {user_id: 777});
    next();
  }),
}));

const mockKeys = jest.fn();
jest.mock('@/services/friskyCache', () => ({
  ...jest.requireActual('@/services/friskyCache'),
  // the database is the one thing a unit test cannot have
  friskyShowKeys: () => mockKeys(),
  remember: jest.fn(),
  enrich: (items: unknown) => Promise.resolve(items),
  kick: jest.fn(),
}));

const {vkMethod} = require('@/helper/vk');
const {showKey} = jest.requireActual('@/services/friskyCache');
import app from '@/router/index';
import {__resetFavoritesIndexCache} from '@/router/api/playlist';

const FRISKY_OWNER = -42311167;
const USER = 777;
const PLAYLIST_ID = 55;

/** a track as VK serves it out of the user's OWN library: their owner id, the group's words */
const copy = (id: number, artist: string, title: string) => ({
  id,
  owner_id: USER,
  artist,
  title: `${title} [vk.com/feelin_frisky]`,
  duration: 3600,
  url: 'https://example.com',
  date: 1700000000,
});

const MARCH = copy(11, 'FRISKY | El Reyalto', 'March 2024 - Tech Coast Tribal');
const APRIL = copy(12, 'FRISKY | Fady Ferraye', 'April 2024 - Hurly Burly');
const NOT_FRISKY = copy(13, 'Some Band', 'Some Song');

/** what the cache knows the group has uploaded */
const catalogue = () => new Set([showKey(MARCH), showKey(APRIL)]);

type Answer = (method: string, params: any) => any;

const vk = (playlistItems: any[] = [], extra?: Answer) => {
  vkMethod.mockImplementation(async (_req: any, method: string, params: any) => {
    const answer = extra?.(method, params);
    if (answer !== undefined) return answer;
    switch (method) {
      case 'audio.getPlaylists':
        return {response: {items: [{id: PLAYLIST_ID, title: 'Frisky-favorites'}]}};
      case 'audio.get':
        // the library, and the playlist when it is asked for by id
        return params.playlist_id
          ? {response: {count: playlistItems.length, items: playlistItems}}
          : {response: {count: 3, items: [NOT_FRISKY, APRIL, MARCH]}};
      case 'audio.addToPlaylist':
        return {response: 1};
      default:
        return {response: 1};
    }
  });
};

describe('POST /api/playlist/frisky/favorites/sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetFavoritesIndexCache();
    mockKeys.mockResolvedValue(catalogue());
  });

  it('adds the group\'s tracks, oldest first, and leaves the rest alone', async () => {
    vk();

    const res = await request(app).post('/api/playlist/frisky/favorites/sync');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({status: 'ok', playlist_id: PLAYLIST_ID, added: 2, remaining: 0});

    const call = vkMethod.mock.calls.find(([, method]: any[]) => method === 'audio.addToPlaylist');
    expect(call).toBeDefined();
    // VK serves a library newest-added first, so the sweep fills the playlist
    // from the bottom up: March was added before April
    expect(call[2]).toEqual({
      owner_id: USER,
      playlist_id: PLAYLIST_ID,
      audio_ids: `${USER}_${MARCH.id},${USER}_${APRIL.id}`,
    });
    // and "Some Band — Some Song" is nobody's favourite
    expect(call[2].audio_ids).not.toContain(String(NOT_FRISKY.id));
  });

  it('adds nothing on a second run', async () => {
    // the playlist already holds both — the copies VK would serve back
    vk([MARCH, APRIL]);

    const res = await request(app).post('/api/playlist/frisky/favorites/sync');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({status: 'ok', added: 0, remaining: 0});
    expect(vkMethod.mock.calls.some(([, method]: any[]) => method === 'audio.addToPlaylist')).toBe(false);
    expect(vkMethod.mock.calls.some(([, method]: any[]) => method === 'audio.add')).toBe(false);
  });

  it('does nothing at all when the catalogue is not cached', async () => {
    mockKeys.mockResolvedValue(new Set());
    vk();

    const res = await request(app).post('/api/playlist/frisky/favorites/sync');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({status: 'skipped', reason: 'catalog_unknown', added: 0});
    // not even a read: "I cannot tell" must not cost the user a VK call, and it
    // certainly must not guess
    expect(vkMethod).not.toHaveBeenCalled();
  });

  it('falls back to audio.add, one at a time, when addToPlaylist is refused', async () => {
    const noise = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    vk([], (method) => {
      if (method === 'audio.addToPlaylist') throw new Error('Method not found');
      return undefined;
    });

    const res = await request(app).post('/api/playlist/frisky/favorites/sync');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({status: 'ok', added: 2, failed: 0});
    const added = vkMethod.mock.calls.filter(([, method]: any[]) => method === 'audio.add');
    expect(added.map(([, , params]: any[]) => params.audio_id)).toEqual([MARCH.id, APRIL.id]);
    expect(added.every(([, , params]: any[]) => params.album_id === PLAYLIST_ID)).toBe(true);
    noise.mockRestore();
  });
});
