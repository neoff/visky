// src/__tests__/router/api/auth.test.ts
import request from 'supertest';

jest.mock('@/helper/vk', () => ({
  vkMethod: jest.fn(),
  checkAuthAndroid: jest.fn((req, res, next) => next()),
}));

const mockMethod = require('@/helper/vk').vkMethod;
import app from '@/router/index';

describe('/api/auth/token', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterAll(() => jest.restoreAllMocks());
  beforeEach(() => jest.clearAllMocks());


  it('should return 400 if no vkurl is provided', async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.errMessage).toContain('No vkurl');
  });

  it('should return 400 if vkurl does not include access_token', async () => {
    const res = await request(app)
      .post('/api/auth/token')
      .send({vkurl: 'https://oauth.vk.com/blank.html#expires_in=0'});

    expect(res.status).toBe(400);
    expect(res.body.errMessage).toContain("No 'access_token'");
  });

  it('should process valid vkurl and return updated session', async () => {
    const userProfileMock = {
      response: {profile: {id: 123456}}
    };

    const refreshMock = {
      token: 'mock_token',
      secret: 'mock_secret'
    };

    mockMethod
      .mockImplementationOnce(() => Promise.resolve(userProfileMock)) // execute.getUserInfo
      .mockImplementationOnce(() => Promise.resolve(refreshMock));    // auth.refreshToken

    const res = await request(app)
      .post('/api/auth/token')
      .send({
        vkurl: 'https://oauth.vk.com/blank.html#access_token=mock_token&secret=mock_secret'
        //url: 'https://oauth.vk.com/blank.html#access_token=mock_token&secret=mock_secret'
      });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBe('mock_token');
    expect(res.body.secret).toBe('mock_secret');
    expect(res.body.user_id).toBe('123456');
  });

  it('should process valid url and return updated session', async () => {
    const userProfileMock = {
      response: {profile: {id: 123456}}
    };

    const refreshMock = {
      token: 'mock_token',
      secret: 'mock_secret'
    };

    mockMethod
      .mockImplementationOnce(() => Promise.resolve(userProfileMock)) // execute.getUserInfo
      .mockImplementationOnce(() => Promise.resolve(refreshMock));    // auth.refreshToken

    const res = await request(app)
      .post('/api/auth/token')
      .send({
        url: 'https://oauth.vk.com/blank.html#access_token=mock_token&secret=mock_secret'
      });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBe('mock_token');
    expect(res.body.secret).toBe('mock_secret');
    expect(res.body.user_id).toBe('123456');
  });

  it('should return 500 if refreshSession fails in /token', async () => {
    const url = 'https://oauth.vk.com/blank.html#access_token=mock_token&secret=mock_secret';

    mockMethod
      .mockResolvedValueOnce({response: {profile: {id: 123456}}})
      .mockRejectedValueOnce({error_msg: 'refreshSession failed'});

    const res = await request(app)
      .post('/api/auth/token')
      .send({vkurl: url});

    expect(res.status).toBe(500);
    expect(res.body.errMessage).toContain('refreshSession failed');
  });
});

describe('/api/auth/refresh', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {
    });
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterAll(() => jest.restoreAllMocks());
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 if session data is missing in POST', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.errMessage).toContain('No access_token/secret');
  });

  it('should establish session and return success when session data is provided', async () => {
    const sessionData = {
      access_token: 'mock_token',
      secret: 'mock_secret',
      user_id: '123456',
      created: new Date().toISOString(),
      maxAge: 1000,
      expires: 30,
    };

    const res = await request(app).post('/api/auth/refresh').send(sessionData);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user_id).toBe('123456');
  });
});

describe('/api/auth/refresh GET', () => {

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterAll(() => jest.restoreAllMocks());
  beforeEach(() => jest.clearAllMocks());

  it('should return refreshed session', async () => {
    mockMethod
      .mockResolvedValueOnce({response: {profile: {id: 123456}}})
      .mockResolvedValueOnce({token: 'mock_token', secret: 'mock_secret'});

    const res = await request(app).get('/api/auth/refresh');
    expect(res.status).toBe(200);
    expect(res.body.secret).toBeDefined();
    expect(res.body.access_token).toBeDefined();
    expect(res.body.user_id).toBeDefined();
  });

  it('should handle error from refreshSession', async () => {
    mockMethod.mockRejectedValueOnce({error_msg: 'Failed refresh'});

    const res = await request(app).get('/api/auth/refresh');
    expect(res.status).toBe(500);
    expect(res.body.errMessage).toContain('Error in getUserInfo');
  });
});

describe('/api/auth/profile', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {
    });
    jest.spyOn(console, 'debug').mockImplementation(() => {
    });
    jest.spyOn(console, 'error').mockImplementation(() => {
    });
    jest.spyOn(console, 'info').mockImplementation(() => {
    });
  });

  afterAll(() => jest.restoreAllMocks());
  beforeEach(() => jest.clearAllMocks());

  it('should return user profile', async () => {
    mockMethod.mockResolvedValueOnce({response: {profile: {id: 123456}}});

    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(200);
    expect(res.body.profile.id).toBe(123456);
  });

  it('should handle error in user profile', async () => {
    mockMethod.mockRejectedValueOnce(new Error('Error in getUserInfo'));

    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(500);
  });
});