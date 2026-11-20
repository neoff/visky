import request from 'supertest';

jest.mock('@/helper/vk', () => ({
  vkMethod: jest.fn(),
  checkAuthAndroid: jest.fn((req: any, _res: any, next: any) => {
    // set on the session express already made — replacing the object leaves
    // the session middleware waiting on a save that never comes
    if (req.session) req.session.user_id = 111;
    else req.session = {user_id: 111};
    next();
  }),
}));
jest.mock('@/services/favoriteLinks', () => ({
  linkFavorite: jest.fn(async () => undefined),
  originalsOf: jest.fn(async () => null),
}));

const {vkMethod} = require('@/helper/vk');
const {linkFavorite, originalsOf} = require('@/services/favoriteLinks');
import app from '@/router/index';
import {__resetFavoritesIndexCache, __resetFriskyCatalog} from '@/router/api/playlist';

const GROUP = -42311167;
const edition = (id: number, month: string, owner = GROUP) => ({
  id, owner_id: owner, artist: 'FRISKY | Jackie Mayden',
  title: `${month} 2026 - Gedonizm [vk.com/feelin_frisky]`,
  duration: 3600, url: `https://example.com/${id}`, date: 1700000000 + id,
});

const favoritesPlaylist = {response: {count: 1, items: [{id: 12345, owner_id: 111, title: 'Frisky-favorites'}]}};

/** VK answers by method; the favourites playlist holds `copies`. */
const vk = (songs: any[], copies: any[]) =>
  vkMethod.mockImplementation((_req: any, method: string, params: any) => {
    if (method === 'audio.getPlaylists') return Promise.resolve(favoritesPlaylist);
    if (method === 'audio.get' && params?.playlist_id === 12345) {
      return Promise.resolve({response: {count: copies.length, items: copies.map((item) => ({...item}))}});
    }
    if (method === 'audio.get') {
      return Promise.resolve({response: {count: songs.length, items: songs.map((item) => ({...item}))}});
    }
    if (method === 'audio.getById') return Promise.resolve({response: [{...edition(11, 'November')}]});
    if (method === 'audio.add') return Promise.resolve({response: 777});
    return Promise.resolve({response: 1});
  });

beforeEach(() => {
  jest.clearAllMocks();
  originalsOf.mockResolvedValue(null);
  __resetFavoritesIndexCache();
  __resetFriskyCatalog();
});

/**
 * The heart is answered BY ID: the user's copy carries a link to the group
 * track it was copied from (vk_tracks.favorite_of). Words only decide for a copy
 * no link could be found for — and then only within the same edition.
 */
describe('the Songs heart, by id', () => {
  it.each(['', '&v=2'])('lights exactly the linked track%s', async (v) => {
    const copy = {...edition(10, 'October'), id: 900, owner_id: 111};
    vk([edition(11, 'November'), edition(10, 'October')], [copy]);
    // the copy is linked to NOVEMBER, whatever its words say
    originalsOf.mockResolvedValue(new Map([['111_900', `${GROUP}_11`]]));

    const res = await request(app).get(`/api/playlist/frisky?count=10${v}`);

    const byId = new Map(res.body.items.map((item: any) => [item.id, item.favorite]));
    expect(byId.get(11)).toBe(true);
    expect(byId.get(10)).toBe(false);
  });

  it('falls back to words for an unlinked copy — the same edition only', async () => {
    const copy = {...edition(10, 'October'), id: 900, owner_id: 111};
    vk([edition(11, 'November'), edition(10, 'October')], [copy]);
    originalsOf.mockResolvedValue(new Map()); // a DB, but no link for it

    const res = await request(app).get('/api/playlist/frisky?count=10');

    const byId = new Map(res.body.items.map((item: any) => [item.id, item.favorite]));
    expect(byId.get(10)).toBe(true);
    expect(byId.get(11)).toBe(false);
  });

  it('records the link when the heart is pressed', async () => {
    vk([], []);

    const res = await request(app)
      .put('/api/playlist/frisky/favorites')
      .send({audio_id: 11, owner_id: GROUP});

    expect(res.status).toBe(200);
    expect(linkFavorite).toHaveBeenCalledWith({owner_id: 111, id: 777}, {owner_id: GROUP, id: 11});
  });

  it('un-hearting removes the copy linked to THAT track, not a namesake', async () => {
    const october = {...edition(10, 'October'), id: 900, owner_id: 111};
    const november = {...edition(11, 'November'), id: 901, owner_id: 111};
    vk([], [october, november]);
    originalsOf.mockResolvedValue(new Map([['111_900', `${GROUP}_10`], ['111_901', `${GROUP}_11`]]));

    const res = await request(app)
      .delete('/api/playlist/frisky/favorites/11')
      .query({owner_id: String(GROUP)});

    expect(res.body.status).toBe('deleted');
    expect(res.body.copy_id).toBe(901);
  });
});
