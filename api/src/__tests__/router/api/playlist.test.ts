import request from 'supertest';
jest.mock('@/helper/vk', () => ({
  vkMethod: jest.fn(),
  checkAuthAndroid: jest.fn((req, res, next) => next()), // просто пропускаем auth
}));

const { vkMethod } = require('@/helper/vk');
import app from '@/router/index';
import {__resetFavoritesIndexCache, __resetFriskyCatalog} from '@/router/api/playlist';

describe('GET /api/playlist/frisky', () => {
  beforeEach(() => jest.clearAllMocks());
  const item_1 = {
    id: 1,
    owner_id: -42311167,
    artist: "FRISKY | Test Artist 1",
    title: "Month 1234 - Test Title 1 [vk.com/feelin_frisky]",
    duration: 123,
    url: "https://example.com",
    date: Date.now(),
  }
  const item_2_1 = {
    id: 1,
    owner_id: -42311167,
    artist: "FRISKY | Test Artist 2",
    title: "Month 1234 - Test Title 2 (Part 1) [vk.com/feelin_frisky]",
    duration: 123,
    url: "https://example.com",
    date: Date.now(),
}
  const item_2_2 = {
    id: 1,
    owner_id: -42311167,
    artist: "FRISKY | Test Artist 2",
    title: "Month 1234 - Test Title 2 (Part 2) [vk.com/feelin_frisky]",
    duration: 123,
    url: "https://example.com",
    date: Date.now(),
  }
  const item_3 = {
    id: 1,
    owner_id: -42311167,
    artist: "FRISKY | Test Artist 3",
    title: "Month 1234 - Test Title 3 [vk.com/feelin_frisky]",
    duration: 123,
    url: "https://example.com",
    date: Date.now(),
  }
  it('should return playlist data', async () => {
    const mockData = {
        count: 10000,
        items: [item_1, item_2_2, item_2_1, item_3],
    };

    vkMethod.mockResolvedValue({ response: mockData });

    const res = await request(app).get('/api/playlist/frisky?count=100&offset=123');

    expect(res.status).toBe(200);
    expect(res.body.count).toEqual(4); // TODO: must be 3 (after merge 2_1 and 2_2)
    expect(res.body.offset).toEqual(123);
    expect(res.body.total).toEqual(10000);
    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.length).toEqual(4); // TODO: must be 3 (after merge 2_1 and 2_2)
    expect(res.body.items[0].artist).toEqual("Test Artist 1");
    expect(res.body.items[0].title).toEqual("Test Title 1");
    expect(res.body.items[0].url).toBeDefined();
    expect(res.body.items[1].artist).toEqual("Test Artist 2");
    expect(res.body.items[1].title).toEqual("Test Title 2 (Part 1)"); // TODO: must be Test Title 2 (after merge 2_1 and 2_2)
    expect(res.body.items[1].url).toBeDefined();
    expect(res.body.items[1].duration).toEqual(123); // TODO: must be 246 (after merge 2_1 and 2_2)
    expect(res.body.items[2].artist).toEqual("Test Artist 2");
    expect(res.body.items[2].title).toEqual("Test Title 2 (Part 2)");
    expect(res.body.items[2].url).toBeDefined();
    expect(res.body.items[3].artist).toEqual("Test Artist 3");
    expect(res.body.items[3].title).toEqual("Test Title 3");
    expect(res.body.items[3].url).toBeDefined();
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.get", {
      count: 100,
      offset: 123,
      owner_id: -42311167
    }, false);
  });

  it('GET /api/playlist/frisky?q= searches the whole group catalogue', async () => {
    __resetFriskyCatalog();
    __resetFavoritesIndexCache();
    // one page shorter than the page size ends the catalogue walk
    vkMethod.mockResolvedValueOnce({response: {count: 4, items: [item_1, item_2_1, item_2_2, item_3]}});
    vkMethod.mockResolvedValueOnce({response: {count: 0, items: []}});  // playlists lookup
    vkMethod.mockResolvedValueOnce({response: {count: 0, items: []}});  // search fallback

    const res = await request(app).get('/api/playlist/frisky?count=10&q=title%202');

    expect(res.status).toBe(200);
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.get", {
      owner_id: -42311167,
      count: 6000,
      offset: 0
    }, false);
    // both parts of "Test Title 2", and Part 1 before Part 2
    expect(res.body.items.map((item: any) => item.title)).toEqual([
      'Test Title 2 (Part 1)',
      'Test Title 2 (Part 2)'
    ]);
    expect(res.body.total).toBe(2);
  });

  it('GET /api/playlist/frisky should return 500 on failure', async () => {
    vkMethod.mockRejectedValueOnce(new Error('VK API down'));

    const res = await request(app).get('/api/playlist/frisky');

    expect(res.status).toBe(500);
    expect(res.body.errMessage).toBe('VK API down');
  });


  it('POST /api/playlist/frisky should return 404 on error', async () => {

    const res = await request(app).post('/api/playlist/frisky');

    expect(res.status).toBe(404);
  });
});

describe('/api/playlist/frisky/favorites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetFavoritesIndexCache();
    __resetFriskyCatalog();
  });

  // the playlist lookup asks audio.getPlaylists FIRST (the user's own
  // playlists) and only falls back to the global audio.searchPlaylists
  const ownPlaylists = (found: boolean) => ({
    response: found
      ? {count: 1, items: [{id: 12345, owner_id: 111, title: 'Frisky-favorites'}]}
      : {count: 0, items: []},
  });
  const noSearchResults = {response: {count: 0, items: []}};

  const item_1 = {
    id: 1,
    owner_id: -111,
    artist: "Test Artist",
    title: "Test Title",
    duration: 123,
    url: "https://example.com",
    date: Date.now(),
  };
  const item_2 = {
    id: 2,
    owner_id: -111,
    artist: "Test Artist 2",
    title: "Test Title 2",
    duration: 123,
    url: "https://example.com",
    date: Date.now(),
  }

  it('GET /api/playlist/frisky/favorites returns an empty list when the playlist does not exist', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(false));   // audio.getPlaylists
    vkMethod.mockResolvedValueOnce(noSearchResults);       // audio.searchPlaylists

    const res = await request(app).get('/api/playlist/frisky/favorites');

    // the playlist is born on the first HEARTED track, not on a page view
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(vkMethod).not.toHaveBeenCalledWith(expect.anything(), "audio.createPlaylist", expect.anything(), false);
  });

  it('GET /api/playlist/frisky/favorites should return playlist when it exists', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));
    vkMethod.mockResolvedValueOnce({response: {count: 10, items: [item_1, item_2]}});

    const res = await request(app).get('/api/playlist/frisky/favorites?count=10');

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
    // every track of THIS list is a favourite by definition
    expect(res.body.items.every((item: any) => item.favorite === true)).toBe(true);
  });

  it('GET /api/playlist/frisky/favorites?playlist_id=all reads the whole library', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));                              // frisky id
    vkMethod.mockResolvedValueOnce({response: {count: 2, items: [item_1, item_2]}}); // audio.get, no playlist

    const res = await request(app).get('/api/playlist/frisky/favorites?playlist_id=all');

    expect(res.status).toBe(200);
    // no playlist_id in the VK call — that IS what "all" means
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.get", {
      owner_id: undefined,
      count: 100,
      offset: 0
    }, false);
    // everything on this tab is in the list the heart writes to
    expect(res.body.items.every((item: any) => item.favorite === true)).toBe(true);
  });

  it('GET /api/playlist/frisky/favorites?playlist_id=42 reads that playlist', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));                      // frisky id
    vkMethod.mockResolvedValueOnce({response: {count: 1, items: [item_2]}}); // audio.get on 42

    const res = await request(app).get('/api/playlist/frisky/favorites?playlist_id=42');

    expect(res.status).toBe(200);
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.get", {
      owner_id: undefined,
      playlist_id: 42,
      count: 100,
      offset: 0
    }, false);
    expect(res.body.items[0].favorite).toBe(true);
  });

  it('GET /api/playlist/frisky/playlists lists the user playlists', async () => {
    vkMethod.mockResolvedValueOnce({
      response: {
        count: 2,
        items: [
          {id: 12345, title: 'Frisky-favorites', count: 3},
          {id: 7, title: 'Other', count: 9}
        ]
      }
    });

    const res = await request(app).get('/api/playlist/frisky/playlists');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      {id: 12345, title: 'Frisky-favorites', count: 3, is_frisky: true},
      {id: 7, title: 'Other', count: 9, is_frisky: false}
    ]);
  });

  it('GET /api/playlist/frisky/favorites?q= searches the whole selected playlist', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));
    vkMethod.mockResolvedValueOnce({response: {count: 2, items: [item_1, item_2]}});

    const res = await request(app).get('/api/playlist/frisky/favorites?count=10&q=artist%202');

    expect(res.status).toBe(200);
    // the WHOLE playlist is read and filtered here — VK cannot search inside one
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.get", {
      owner_id: undefined,
      playlist_id: 12345,
      count: 6000,
      offset: 0
    }, false);
    expect(res.body.items.map((item: any) => item.title)).toEqual(['Test Title 2']);
    expect(res.body.total).toBe(1);
  });

  it('GET /api/playlist/frisky/favorites?playlist_id=all&q= adds the VK-wide matches', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));                              // frisky id
    // the library is fetched ONCE and doubles as the index for the hearts
    vkMethod.mockResolvedValueOnce({response: {count: 2, items: [item_1, item_2]}}); // library
    vkMethod.mockResolvedValueOnce({                                                 // audio.search
      response: {count: 1, items: [{...item_2, id: 900, owner_id: -5}]}
    });

    const res = await request(app).get('/api/playlist/frisky/favorites?playlist_id=all&q=test%20artist');

    expect(res.status).toBe(200);
    // NOT url-encoded: vkMethod signs the url it builds and VK checks the sig
    // against the decoded params, so an encoded "moby%20heart" was rejected with
    // "sig param is incorrect" and every multi-word search came back empty
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.search", {
      q: 'test artist',
      count: 100,
      auto_complete: 1
    }, false);
    // the user's own tracks first, the rest of VK under `global`
    expect(res.body.items.length).toBe(2);
    expect(res.body.global.map((item: any) => item.id)).toEqual([900]);
    // suggestions are lit against the LIBRARY, which is what "All" hearts write
    // to — this one IS in it (same artist|title as item_2), under another id
    expect(res.body.global[0].favorite).toBe(true);
  });

  it('PUT /api/playlist/frisky/favorites should add track to favorites', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));
    vkMethod.mockResolvedValueOnce({response: {id: 777}});   // audio.add

    const res = await request(app)
      .put('/api/playlist/frisky/favorites')
      .send({audio_id: 456239017, owner_id: -42311167});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('added');
    expect(res.body.copy_id).toBe(777);
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.add", {
      audio_id: 456239017,
      owner_id: -42311167,
      album_id: 12345
    }, false);
  });

  it('PUT /api/playlist/frisky/favorites creates the playlist when the user has none', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(false));
    vkMethod.mockResolvedValueOnce(noSearchResults);
    vkMethod.mockResolvedValueOnce({response: {id: 999}});    // audio.createPlaylist
    vkMethod.mockResolvedValueOnce({response: {id: 777}});    // audio.add

    const res = await request(app)
      .put('/api/playlist/frisky/favorites')
      .send({audio_id: 456239017});

    // the FIRST heart the user ever taps has to work
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('added');
  });

  it('PUT /api/playlist/frisky/favorites without audio_id should return 400', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));

    const res = await request(app).put('/api/playlist/frisky/favorites').send({});

    expect(res.status).toBe(400);
  });

  it('DELETE /api/playlist/frisky/favorites/:id removes the users COPY from the playlist', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));                       // frisky id
    // what is in the playlist: the user's copy, under its own id
    vkMethod.mockResolvedValueOnce({
      response: {count: 1, items: [{...item_1, id: 555, owner_id: 111}]},
    });
    // audio.getById for the frisky track the app is pointing at
    vkMethod.mockResolvedValueOnce({response: [{...item_1, id: 456239017, owner_id: -42311167}]});
    vkMethod.mockResolvedValueOnce({response: 1});                            // audio.removeFromPlaylist

    const res = await request(app)
      .delete('/api/playlist/frisky/favorites/456239017')
      .query({owner_id: '-42311167'});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('deleted');
    expect(res.body.copy_id).toBe(555);
    // `audio.delete` alone leaves the track in the playlist — VK says response:1
    // and serves it again on the next audio.get. And it must NOT run here: the
    // copy may be in other playlists too.
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.removeFromPlaylist", {
      owner_id: undefined,
      playlist_id: 12345,
      audio_ids: "111_555"
    }, false);
    expect(vkMethod).not.toHaveBeenCalledWith(expect.anything(), "audio.delete", expect.anything(), false);
  });

  it('DELETE ?playlist_id=all takes the track out of the library', async () => {
    // no playlist lookup at all for "all"
    vkMethod.mockResolvedValueOnce({
      response: {count: 1, items: [{...item_1, id: 555, owner_id: 111}]},     // library index
    });
    vkMethod.mockResolvedValueOnce({response: [{...item_1, id: 456239017, owner_id: -42311167}]});
    vkMethod.mockResolvedValueOnce({response: 1});                            // audio.delete

    const res = await request(app)
      .delete('/api/playlist/frisky/favorites/456239017')
      .query({owner_id: '-42311167', playlist_id: 'all'});

    expect(res.status).toBe(200);
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.delete", {
      audio_id: 555,
      owner_id: 111
    }, false);
    expect(vkMethod).not.toHaveBeenCalledWith(expect.anything(), "audio.removeFromPlaylist", expect.anything(), false);
  });

  it('PUT with a NUMERIC playlist_id in the body adds to that playlist', async () => {
    vkMethod.mockResolvedValueOnce({response: {id: 777}});   // audio.add, no lookup needed

    const res = await request(app)
      .put('/api/playlist/frisky/favorites')
      // a JSON body sends the id as a number; treating it as a string crashed
      // the handler with "requested?.trim is not a function"
      .send({audio_id: 456239017, owner_id: -42311167, playlist_id: 69931956});

    expect(res.status).toBe(200);
    expect(res.body.playlist_id).toBe(69931956);
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.add", {
      audio_id: 456239017,
      owner_id: -42311167,
      album_id: 69931956
    }, false);
  });

  it('PUT ?playlist_id=all adds to the library and to no playlist', async () => {
    vkMethod.mockResolvedValueOnce({response: {id: 777}});   // audio.add

    const res = await request(app)
      .put('/api/playlist/frisky/favorites')
      .send({audio_id: 456239017, owner_id: -42311167, playlist_id: 'all'});

    expect(res.status).toBe(200);
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.add", {
      audio_id: 456239017,
      owner_id: -42311167
    }, false);
  });

  it('DELETE /api/playlist/frisky/favorites/:id deletes nothing when the track is not in the playlist', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));
    vkMethod.mockResolvedValueOnce({response: {count: 1, items: [{...item_2, id: 556, owner_id: 111}]}});
    vkMethod.mockResolvedValueOnce({response: [{...item_1, id: 456239017, owner_id: -42311167}]});

    const res = await request(app)
      .delete('/api/playlist/frisky/favorites/456239017')
      .query({owner_id: '-42311167'});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('not_in_favorites');
    expect(vkMethod).not.toHaveBeenCalledWith(expect.anything(), "audio.delete", expect.anything(), false);
    expect(vkMethod).not.toHaveBeenCalledWith(expect.anything(), "audio.removeFromPlaylist", expect.anything(), false);
  });

  it('POST /api/playlist/frisky/create-favorites should create playlist', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(false));
    vkMethod.mockResolvedValueOnce(noSearchResults);
    vkMethod.mockResolvedValueOnce({ response: { id: 12345 } });   // createPlaylist
    vkMethod.mockResolvedValueOnce({
      response: {
        count: 2,
        items: [
          {id: 1, owner_id: 123, artist: "Test", title: "Feelin_Frisky Part 1", duration: 120, url: "test.com", date: 1000},
          {id: 2, owner_id: 123, artist: "Test", title: "Feelin Frisky Part 2", duration: 120, url: "test.com", date: 2000}
        ]
      }
    });

    const res = await request(app).post('/api/playlist/frisky/create-favorites');

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('created');
    expect(res.body.playlistId).toBe(12345);
  });

  it('POST /api/playlist/frisky/create-favorites should return 409 if playlist exists', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));

    const res = await request(app).post('/api/playlist/frisky/create-favorites');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Playlist already exists');
    expect(res.body.playlistId).toBe(12345);
  });

  it('PATCH /api/playlist/frisky/create-favorites should return 404 if playlist not exists', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(false));
    vkMethod.mockResolvedValueOnce(noSearchResults);

    const res = await request(app).patch('/api/playlist/frisky/create-favorites');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Playlist not found');
  });

  it('PATCH /api/playlist/frisky/create-favorites should recreate playlist', async () => {
    vkMethod.mockResolvedValueOnce(ownPlaylists(true));
    vkMethod.mockResolvedValueOnce({
      response: {
        count: 1,
        items: [{ id: 999, owner_id: 123, artist: "Old", title: "Track", duration: 120, url: "test.com" }]
      }
    });
    vkMethod.mockResolvedValueOnce({ response: 1 }); // audio.delete
    vkMethod.mockResolvedValueOnce({
      response: {
        count: 3,
        items: [
          { id: 1, owner_id: 123, artist: "Test", title: "Feelin_Frisky Part 1", duration: 120, url: "test.com", date: 1000 },
          { id: 2, owner_id: 123, artist: "Test", title: "Feelin Frisky Part 2", duration: 120, url: "test.com", date: 2000 },
          { id: 3, owner_id: 123, artist: "Other", title: "Random", duration: 120, url: "test.com", date: 3000 }
        ]
      }
    });
    vkMethod.mockResolvedValueOnce({ response: { id: 1 } });
    vkMethod.mockResolvedValueOnce({ response: { id: 2 } });

    const res = await request(app).patch('/api/playlist/frisky/create-favorites');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('recreated');
    expect(res.body.playlistId).toBe(12345);
    expect(res.body.deletedTracks).toBe(1);
    expect(res.body.tracksAdded).toBe(2);
    expect(res.body.totalFriskyTracks).toBe(2);
  });


  it('POST /api/playlist/favorites should return 404 on error', async () => {

    const res = await request(app).post('/api/playlist/frisky?owner=123');

    expect(res.status).toBe(404);
  });

});

describe('/api/playlist', () => {
  beforeEach(() => jest.clearAllMocks());
  const item_1 = {
    id: 1,
    owner_id: -222,
    artist: "Test Artist",
    title: "Test Title",
    duration: 123,
    url: "https://example.com",
    date: Date.now(),
  };
  const item_2 = {
    id: 1,
    owner_id: -3333,
    artist: "Test Artist",
    title: "Test Title",
    duration: 123,
    url: "https://example.com",
    date: Date.now(),
};
  it('GET /api/playlist/ should return playlist', async () => {
    const mockData = {
        count: 10000,
        items: [item_1, item_2],
    };
    vkMethod.mockResolvedValueOnce({ response: mockData });

    const res = await request(app).get('/api/playlist?owner=321&offset=5');

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBeGreaterThanOrEqual(0);
    expect(vkMethod).toHaveBeenCalledWith(expect.anything(), "audio.get", {
      count: 1,
      offset: 5,
      owner_id: 321
    }, false);
  });

  it('GET /api/playlist/ without owner_id should return 400', async () => {
    const res = await request(app).get('/api/playlist');
    expect(res.status).toBe(400);
    expect(res.body.errData).toBe('No owner_id');
  });

  it('PUT /api/playlist should return 200', async () => {
    const mockData = {
      count: 10000,
      items: [item_1],
    };
    vkMethod.mockResolvedValueOnce({ response: mockData });
    const res = await request(app).put('/api/playlist?owner=123');

    expect(res.status).toBe(200);
  });

  it('DELETE /api/playlist/favorites should return 200', async () => {
    const mockData = {
      count: 10000,
      items: [item_2],
    };
    vkMethod.mockResolvedValueOnce({ response: mockData });
    const res = await request(app).delete('/api/playlist?owner=123');

    expect(res.status).toBe(200);
  });

  it('POST /api/playlist/ should return 404 on error', async () => {
    const res = await request(app).post('/api/playlist/playlist?owner=123');

    expect(res.status).toBe(404);
  });

  it('GET /api/playlist/ should return 500 on error', async () => {
    const res = await request(app).get('/api/playlist');

    expect(res.status).toBe(400);
    expect(res.body.errData).toBe('No owner_id');
  });
});