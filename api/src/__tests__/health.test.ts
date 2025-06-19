// health.test.ts
import request from 'supertest';
import express from 'express';
import { healthRoute } from '@/router/health/health';

jest.mock('os');
jest.mock('fs');
jest.mock('node-fetch', () => jest.fn());

import os from 'os';
import fs from 'fs';
import fetch from 'node-fetch';

const mockedFetch = fetch as jest.Mock;

describe('healthRoute', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // mock os
    (os.totalmem as jest.Mock).mockReturnValue(1000);
    (os.freemem as jest.Mock).mockReturnValue(500);

    // mock fs
    (fs.statSync as jest.Mock).mockReturnValue({
      isDirectory: () => true,
    });

    // mock fetch
    mockedFetch.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'UP' }),
      })
    );
  });

  it('should return health status with all components UP', async () => {
    const app = express();
    app.get('/health', healthRoute());

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'UP',
      components: {
        diskSpace: {
          status: 'UP',
          details: {
            total: 1000,
            free: 500,
            threshold: 10485760,
            path: expect.any(String),
            exists: true,
          },
        },
        ping: { status: 'UP' },
        ssl: {
          status: 'UP',
          details: {
            validChains: [],
            invalidChains: [],
          },
        },
      },
    });
  });
});