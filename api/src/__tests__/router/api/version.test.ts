import request from 'supertest';

jest.mock('@/helper/vk', () => ({
  vkMethod: jest.fn(),
  checkAuthAndroid: jest.fn((_req: any, _res: any, next: any) => next()),
}));

import app from '@/router/index';
import {__resetStoreVersion, storeKindFor} from '@/services/storeVersion';

const IOS_UA = 'visky/13 CFNetwork/3826.500.62 Darwin/25.0.0';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const ANDROID_UA = 'okhttp/4.12.0';

const appStore = (version: string | null) =>
  jest.fn(async () => ({
    ok: true,
    json: async () => ({resultCount: version ? 1 : 0, results: version ? [{version}] : []}),
  }));

const realFetch = global.fetch;

beforeEach(() => {
  __resetStoreVersion();
});

afterEach(() => {
  global.fetch = realFetch;
});

/**
 * The installed clients put up "a new version is in the App Store" when this
 * answers a number newer than theirs. It used to answer the api's own build, so
 * deploying the api announced a release no store had.
 */
describe('/api/version', () => {
  it('answers with the App Store version, not the api build', async () => {
    global.fetch = appStore('1.5.59') as any;

    const response = await request(app).get('/api/version').set('User-Agent', IOS_UA);

    expect(response.status).toBe(200);
    expect(response.body.version).toBe('1.5.59');
    expect(response.body.api).toBe(require('../../../../package.json').version);
  });

  it('asks for the Mac listing when the desktop asks', async () => {
    const fetch = appStore('1.5.58');
    global.fetch = fetch as any;

    const response = await request(app).get('/api/version').set('User-Agent', MAC_UA);

    expect(response.body.version).toBe('1.5.58');
    expect(String((fetch.mock.calls[0] as any[])[0])).toContain('entity=desktopSoftware');
  });

  it('says nothing to Android — Play has no lookup to mirror', async () => {
    const fetch = appStore('9.9.9');
    global.fetch = fetch as any;

    const response = await request(app).get('/api/version').set('User-Agent', ANDROID_UA);

    expect(response.status).toBe(200);
    expect(response.body.version).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says nothing when Apple does not answer', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('timeout');
    }) as any;

    const response = await request(app).get('/api/version').set('User-Agent', IOS_UA);

    expect(response.status).toBe(200);
    expect(response.body.version).toBeUndefined();
  });

  it('answers without any credentials at all', async () => {
    global.fetch = appStore('1.5.59') as any;
    // No x-auth-* headers: a signed-out device is the most likely to be old.
    const response = await request(app).get('/api/version').set('User-Agent', IOS_UA);

    expect(response.status).toBe(200);
  });

  it('is not cached across clients', async () => {
    global.fetch = appStore('1.5.59') as any;

    const response = await request(app).get('/api/version').set('User-Agent', IOS_UA);

    expect(response.headers['cache-control']).toContain('private');
    expect(response.headers['vary']).toMatch(/user-agent/i);
  });
});

describe('telling the clients apart', () => {
  it.each([
    [IOS_UA, 'ios'],
    [MAC_UA, 'mac'],
    [ANDROID_UA, 'none'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36', 'none'],
    [undefined, 'none'],
    ['curl/8.7.1', 'none'],
  ])('%s → %s', (ua, kind) => {
    expect(storeKindFor(ua)).toBe(kind);
  });
});
