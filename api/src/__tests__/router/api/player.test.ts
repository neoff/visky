import request from 'supertest';

/**
 * The auth middleware is replaced by one that plants the session the real one
 * would have restored from the `x-auth-*` headers.
 */
jest.mock('@/helper/vk', () => ({
  vkMethod: jest.fn(),
  checkAuthAndroid: jest.fn((req: any, _res: any, next: any) => {
    // assign INTO the express-session object: replacing it would strip .save()
    // and the response would never finish
    Object.assign(req.session, {
      user_id: '4242',
      access_token: 'token',
      secret: 'secret',
      device_id: req.headers['x-auth-device'] ?? 'phone-device',
    });
    next();
  }),
}));

const {vkMethod} = require('@/helper/vk');
import app from '@/router/index';
import {__resetPlayback} from '@/services/playback';
import {__resetDeviceRegistry} from '@/services/devices';

const PHONE = 'phone-device';
const TABLET = 'tablet-device';

const asPhone = (req: request.Test) => req.set('x-auth-device', PHONE);
const asTablet = (req: request.Test) => req.set('x-auth-device', TABLET);

const TRACK = {
  track_id: '-42311167_1',
  owner_id: -42311167,
  id: 1,
  title: 'Artist of the Week Part 1',
  duration: 3600,
};

describe('/api/player', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPlayback();
    __resetDeviceRegistry();
  });

  it('returns an empty session before anything has played', async () => {
    const res = await asPhone(request(app).get('/api/player/state'));
    expect(res.status).toBe(200);
    expect(res.body.state.active_device_id).toBeNull();
    expect(res.body.state.track).toBeNull();
    expect(typeof res.body.server_now_ms).toBe('number');
  });

  it('remembers what a device is playing and hands it to another device', async () => {
    const started = await asPhone(
      request(app).put('/api/player/state').send({track: TRACK, playing: true, position_ms: 30_000}),
    );
    expect(started.status).toBe(200);
    expect(started.body.state.active_device_id).toBe(PHONE);

    // the tablet asks what is going on: same track, position moved on
    const seen = await asTablet(request(app).get('/api/player/state'));
    expect(seen.body.state.track.track_id).toBe(TRACK.track_id);
    expect(seen.body.position_now_ms).toBeGreaterThanOrEqual(30_000);
    expect(seen.body.devices.map((d: any) => d.device_id).sort()).toEqual([PHONE, TABLET].sort());

    const moved = await asTablet(request(app).post('/api/player/transfer').send({to_device_id: TABLET}));
    expect(moved.status).toBe(200);
    expect(moved.body.state.active_device_id).toBe(TABLET);
    expect(moved.body.state.playing).toBe(true);
    expect(moved.body.state.position_ms).toBeGreaterThanOrEqual(30_000);
  });

  it('rejects a transfer without a target', async () => {
    const res = await asPhone(request(app).post('/api/player/transfer').send({}));
    expect(res.status).toBe(400);
  });

  it('registers a device and its push token', async () => {
    const res = await asPhone(
      request(app)
        .post('/api/player/devices')
        .send({name: 'iPhone', platform: 'ios', push_token: 'ExponentPushToken[xxx]'}),
    );
    expect(res.status).toBe(200);
    const phone = res.body.devices.find((d: any) => d.device_id === PHONE);
    expect(phone.name).toBe('iPhone');
    expect(phone.can_wake).toBe(true);
  });

  it('re-resolves a track by its VK ids so the target signs its own stream', async () => {
    vkMethod.mockResolvedValue({
      response: [
        {
          id: 1,
          owner_id: -42311167,
          artist: 'FRISKY | Test Artist',
          title: 'Month 1234 - Test Title [vk.com/feelin_frisky]',
          duration: 3600,
          url: 'https://example.com/stream.m3u8',
        },
      ],
    });

    const res = await asTablet(request(app).get('/api/player/track/-42311167/1'));
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Test Title');
    expect(res.body.artist).toBe('Test Artist');
    expect(res.body.url).toBe('https://example.com/stream.m3u8');
  });

  it('404s a track VK does not know', async () => {
    vkMethod.mockResolvedValue({response: []});
    const res = await asPhone(request(app).get('/api/player/track/-42311167/9'));
    expect(res.status).toBe(404);
  });

  it('keeps the legacy status ping working', async () => {
    const res = await asPhone(
      request(app).patch('/api/player/4242/-42311167/1').send({device_id: PHONE, status: 1}),
    );
    expect(res.status).toBe(200);
    expect(res.body.state.playing).toBe(true);
    expect(res.body.state.active_device_id).toBe(PHONE);
  });
});
