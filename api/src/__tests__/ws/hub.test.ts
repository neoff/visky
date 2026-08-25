/**
 * End-to-end over a real socket: two devices of one account, a transfer, and
 * the timing that has to survive it.
 *
 * `PLAYBACK_TRUST_HEADERS` skips the VK round trip the handshake would normally
 * make — the credentials themselves are not what this exercises.
 */
process.env.PLAYBACK_TRUST_HEADERS = 'true';

import {createServer, Server} from 'http';
import {AddressInfo} from 'net';
import {WebSocket} from 'ws';
import {attachPlaybackSocket, WS_PATH} from '@/ws/hub';
import {__resetPlayback} from '@/services/playback';
import {__resetDeviceRegistry} from '@/services/devices';
import {ServerFrame} from '@/types/playback';

const USER = '4242';
const PHONE = 'phone-device';
const TABLET = 'tablet-device';

const TRACK = {
  track_id: '-42311167_1',
  owner_id: -42311167,
  id: 1,
  title: 'Artist of the Week Part 1',
  duration: 3600,
};

let server: Server;
let port: number;

const connect = (deviceId: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`, {
      headers: {'x-auth-token': 'token', 'x-auth-user': USER, 'x-auth-device': deviceId},
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });

/** Wait for the first frame of a kind that also satisfies `match`. */
const waitFor = <T extends ServerFrame['t']>(
  ws: WebSocket,
  kind: T,
  match: (frame: any) => boolean = () => true,
  timeoutMs = 2_000,
): Promise<any> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`timed out waiting for ${kind}`));
    }, timeoutMs);
    const onMessage = (raw: Buffer) => {
      const frame = JSON.parse(raw.toString());
      if (frame.t === kind && match(frame)) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(frame);
      }
    };
    ws.on('message', onMessage);
  });

const hello = async (ws: WebSocket, deviceId: string, name: string): Promise<void> => {
  const state = waitFor(ws, 'state');
  ws.send(JSON.stringify({t: 'hello', device_id: deviceId, name, platform: 'ios'}));
  await state;
};

beforeAll(async () => {
  server = createServer();
  attachPlaybackSocket(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  __resetPlayback();
  __resetDeviceRegistry();
});

describe('playback socket', () => {
  it('hands the sound from one device to the other, with the position intact', async () => {
    const phone = await connect(PHONE);
    const tablet = await connect(TABLET);
    await hello(phone, PHONE, 'iPhone');
    await hello(tablet, TABLET, 'Pixel');

    // the phone starts playing a minute into the show
    const seenByTablet = waitFor(tablet, 'state', (f) => f.state.active_device_id === PHONE);
    phone.send(JSON.stringify({t: 'update', update: {track: TRACK, playing: true, position_ms: 60_000}}));
    const started = await seenByTablet;
    expect(started.state.track.track_id).toBe(TRACK.track_id);
    expect(started.state.playing).toBe(true);

    // the tablet takes over
    const phoneSees = waitFor(phone, 'state', (f) => f.state.active_device_id === TABLET);
    const tabletSees = waitFor(tablet, 'state', (f) => f.state.active_device_id === TABLET);
    tablet.send(JSON.stringify({t: 'transfer', to_device_id: TABLET}));

    const [onPhone, onTablet] = await Promise.all([phoneSees, tabletSees]);
    // the phone learns it is no longer the one making sound...
    expect(onPhone.state.active_device_id).toBe(TABLET);
    // ...and the tablet is told where to seek to, not where the phone once was
    expect(onTablet.state.position_ms).toBeGreaterThanOrEqual(60_000);
    expect(onTablet.state.playing).toBe(true);
    expect(onTablet.state.version).toBe(started.state.version + 1);

    phone.close();
    tablet.close();
  });

  it('lists both devices, marking the one that owns the sound', async () => {
    const phone = await connect(PHONE);
    const tablet = await connect(TABLET);
    await hello(phone, PHONE, 'iPhone');

    const roster = waitFor(phone, 'devices', (f) => f.devices.length === 2);
    await hello(tablet, TABLET, 'Pixel');
    const {devices} = await roster;
    expect(devices.every((d: any) => d.online)).toBe(true);

    const updated = waitFor(phone, 'devices', (f) => f.devices.some((d: any) => d.is_active));
    phone.send(JSON.stringify({t: 'update', update: {track: TRACK, playing: true, position_ms: 0}}));
    const active = (await updated).devices.find((d: any) => d.is_active);
    expect(active.device_id).toBe(PHONE);
    expect(active.name).toBe('iPhone');

    phone.close();
    tablet.close();
  });

  it('answers a ping with the server clock, so devices can measure their offset', async () => {
    const phone = await connect(PHONE);
    await hello(phone, PHONE, 'iPhone');
    const clientNow = Date.now();
    const pong = waitFor(phone, 'pong');
    phone.send(JSON.stringify({t: 'ping', client_now_ms: clientNow}));
    const frame = await pong;
    expect(frame.client_now_ms).toBe(clientNow);
    expect(typeof frame.server_now_ms).toBe('number');
    phone.close();
  });

  it('refuses a socket with no credentials', async () => {
    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`);
        ws.once('open', () => resolve('opened'));
        ws.once('error', reject);
      }),
    ).rejects.toThrow(/401/);
  });
});
