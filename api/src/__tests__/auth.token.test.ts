import request from 'supertest';
import app from '@/router/index';
import session from 'express-session';

jest.mock('@/helpers/vk', () => ({
  method: jest.fn(),
  checkAuthAndroid: jest.fn((req, res, next) => next()),
}));

const mockMethod = require('@/helpers/vk').method;

describe('/api/auth/token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
});