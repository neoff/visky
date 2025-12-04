import request from 'supertest';
jest.mock('@/helper/vk', () => ({
  vkMethod: jest.fn(),
  checkAuthAndroid: jest.fn((req, res, next) => next()), // просто пропускаем auth
}));

const { vkMethod } = require('@/helper/vk');
import app from '@/router/index';

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
  beforeEach(() => jest.clearAllMocks());
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

  it('GET /api/playlist/frisky/favorites should return 404 when playlist not found', async () => {
    // Mock searchPlaylists to return no results
    vkMethod.mockResolvedValueOnce({ response: { count: 0, items: [] } });

    const res = await request(app).get('/api/playlist/frisky/favorites');

    expect(res.status).toBe(404);
    expect(res.body.errMessage).toContain('Frisky-favorites playlist not found');
  });

  it('GET /api/playlist/frisky/favorites should return playlist when it exists', async () => {
    const mockPlaylistData = {
        count: 10,
        items: [item_1, item_2],
    };
    
    // Mock searchPlaylists to return playlist
    vkMethod.mockResolvedValueOnce({ response: { count: 1, items: [{ id: 12345 }] } });
    // Mock audio.get to return tracks
    vkMethod.mockResolvedValueOnce({ response: mockPlaylistData });

    const res = await request(app).get('/api/playlist/frisky/favorites?count=10');

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('PUT /api/playlist/frisky/favorites should add track to favorites', async () => {
    // Mock searchPlaylists to return playlist
    vkMethod.mockResolvedValueOnce({ response: { count: 1, items: [{ id: 12345 }] } });
    // Mock audio.add for main favorites
    vkMethod.mockResolvedValueOnce({ response: 1 });
    // Mock audio.add for Frisky-favorites playlist
    vkMethod.mockResolvedValueOnce({ response: 1 });
    
    const res = await request(app)
      .put('/api/playlist/frisky/favorites')
      .send({ audio_id: 456239017, owner_id: -42311167 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('added');
  });

  it('PUT /api/playlist/frisky/favorites should return 404 when playlist not found', async () => {
    vkMethod.mockResolvedValueOnce({ response: { count: 0, items: [] } });

    const res = await request(app)
      .put('/api/playlist/frisky/favorites')
      .send({ audio_id: 456239017 });

    expect(res.status).toBe(404);
  });

  it('DELETE /api/playlist/frisky/favorites/:id should delete track', async () => {
    // Mock searchPlaylists to return playlist
    vkMethod.mockResolvedValueOnce({ response: { count: 1, items: [{ id: 12345 }] } });
    // Mock audio.delete
    vkMethod.mockResolvedValueOnce({ response: 1 });
    
    const res = await request(app)
      .delete('/api/playlist/frisky/favorites/456239017')
      .query({ owner_id: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('deleted');
  });

  it('POST /api/playlist/frisky/create-favorites should create playlist', async () => {
    // Mock searchPlaylists to return no playlist
    vkMethod.mockResolvedValueOnce({ response: { count: 0, items: [] } });
    // Mock createPlaylist
    vkMethod.mockResolvedValueOnce({ response: { id: 12345 } });
    // Mock audio.get for user favorites
    vkMethod.mockResolvedValueOnce({ 
      response: { 
        count: 2, 
        items: [
          { 
            id: 1, 
            owner_id: 123, 
            artist: "Test", 
            title: "Feelin_Frisky Part 1",
            duration: 120,
            url: "test.com",
            date: 1000
          },
          { 
            id: 2, 
            owner_id: 123, 
            artist: "Test", 
            title: "Feelin Frisky Part 2",
            duration: 120,
            url: "test.com",
            date: 2000
          }
        ] 
      } 
    });
    
    const res = await request(app).post('/api/playlist/frisky/create-favorites');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('created');
    expect(res.body.playlistId).toBe(12345);
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