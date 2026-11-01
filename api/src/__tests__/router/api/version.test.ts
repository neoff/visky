import request from 'supertest';

jest.mock('@/helper/vk', () => ({
  vkMethod: jest.fn(),
  checkAuthAndroid: jest.fn((_req: any, _res: any, next: any) => next()),
}));

import app from '@/router/index';

/**
 * The clients ask this on launch to find out they are a release behind. It is
 * the one route that must answer a device nobody has signed in.
 */
describe('/api/version', () => {
  it('answers with the release this api belongs to', async () => {
    const response = await request(app).get('/api/version');

    expect(response.status).toBe(200);
    expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(response.body.version).toBe(require('../../../../package.json').version);
  });

  it('answers without any credentials at all', async () => {
    // No x-auth-* headers: a signed-out device is the most likely to be old.
    const response = await request(app).get('/api/version');

    expect(response.status).toBe(200);
  });
});
