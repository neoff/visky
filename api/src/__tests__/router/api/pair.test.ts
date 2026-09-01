import request from 'supertest';

/**
 * The auth middleware is replaced by one that plants the session the real one
 * would have restored from the `x-auth-*` headers, and `vkMethod` stands in for
 * the check that those credentials are real.
 */
jest.mock('@/helper/vk', () => ({
  vkMethod: jest.fn(),
  checkAuthAndroid: jest.fn((req: any, _res: any, next: any) => {
    Object.assign(req.session, {
      user_id: req.headers['x-auth-user'] ?? '4242',
      access_token: req.headers['x-auth-token'] ?? 'token',
      secret: req.headers['x-auth-secret'] ?? 'secret',
      device_id: 'phone-device',
    });
    next();
  }),
}));

const {vkMethod} = require('@/helper/vk');
import app from '@/router/index';
import {__resetPairing} from '@/services/pairing';
import {__resetSessionCache} from '@/services/session';

const open = async (name = 'Mac (Chrome)') => {
  const response = await request(app).post('/api/pair').send({name, platform: 'web'});
  expect(response.status).toBe(200);
  return response.body as {pair_id: string; code: string; expires_in: number};
};

describe('/api/pair', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPairing();
    __resetSessionCache();
    // The phone's token is real as far as VK is concerned.
    vkMethod.mockResolvedValue({response: [{id: 4242}]});
  });

  it('carries a session from the phone to the screen that asked', async () => {
    const ticket = await open();

    // Nothing yet: the waiting screen is told to keep waiting, not that it failed.
    await request(app).get(`/api/pair/${ticket.pair_id}`).expect(204);

    await request(app).post(`/api/pair/${ticket.pair_id}/claim`).send({expires_in: 3600}).expect(200);

    const delivered = await request(app).get(`/api/pair/${ticket.pair_id}`).expect(200);
    expect(delivered.body).toEqual({
      access_token: 'token',
      secret: 'secret',
      user_id: '4242',
      expires_in: 3600,
    });
    // Never cached: this body is the account.
    expect(delivered.headers['cache-control']).toBe('no-store');
  });

  it('delivers once and then forgets the slot', async () => {
    const ticket = await open();
    await request(app).post(`/api/pair/${ticket.pair_id}/claim`).send({}).expect(200);

    await request(app).get(`/api/pair/${ticket.pair_id}`).expect(200);
    await request(app).get(`/api/pair/${ticket.pair_id}`).expect(410);
  });

  it('takes the short code as well as the id', async () => {
    const ticket = await open('Studio Mac');

    const peeked = await request(app).get(`/api/pair/${ticket.code}/peek`).expect(200);
    expect(peeked.body.name).toBe('Studio Mac');
    // The peek says who is waiting and nothing else.
    expect(peeked.body.access_token).toBeUndefined();

    await request(app).post(`/api/pair/${ticket.code}/claim`).send({}).expect(200);
    await request(app).get(`/api/pair/${ticket.pair_id}`).expect(200);
  });

  it('refuses to park a session VK does not recognise', async () => {
    const ticket = await open();
    vkMethod.mockRejectedValue(new Error('invalid token'));

    await request(app).post(`/api/pair/${ticket.pair_id}/claim`).send({}).expect(403);
    // And the slot is still empty rather than holding a forged session.
    await request(app).get(`/api/pair/${ticket.pair_id}`).expect(204);
  });

  it('refuses a session claiming a user id VK disagrees with', async () => {
    const ticket = await open();
    vkMethod.mockResolvedValue({response: [{id: 777}]});

    await request(app)
      .post(`/api/pair/${ticket.pair_id}/claim`)
      .set('x-auth-user', '4242')
      .send({})
      .expect(403);
  });

  it('will not fill the same slot twice', async () => {
    const ticket = await open();
    await request(app).post(`/api/pair/${ticket.pair_id}/claim`).send({}).expect(200);
    await request(app).post(`/api/pair/${ticket.pair_id}/claim`).send({}).expect(409);
  });

  it('says a code is gone rather than pretending it is pending', async () => {
    await request(app).get('/api/pair/0123456789abcdef0123456789abcdef').expect(410);
    await request(app).get('/api/pair/ZZZZZZZZ/peek').expect(410);
    await request(app).post('/api/pair/ZZZZZZZZ/claim').send({}).expect(410);
  });
});
