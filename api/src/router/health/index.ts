// health.ts //yarn add node-fetch
import os from 'os';
import fs from 'fs';
import {Request, Response, RequestHandler, Express} from 'express';
import getMetrics, {register} from "@/router/health/metrics";

export const healthSetup = (): RequestHandler => {
  return async (_req: Request, res: Response) => {
    const diskPath = process.cwd();
    const threshold = 10 * 1024 * 1024;

    let total = 0;
    let free = 0;
    let exists = false;

    try {
      const stat = fs.statSync(diskPath);
      if (stat.isDirectory()) {
        total = os.totalmem();
        free = os.freemem();
        exists = true;
      }
    } catch {
      // ignore
    }

    res.json({
      status: 'UP',
      components: {
        diskSpace: {
          status: 'UP',
          details: {
            total,
            free,
            threshold,
            path: diskPath,
            exists,
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
  };
}

const setupHealth = (app: Express): void => {

  app.get('/health', healthSetup());
  app.get('/prometheus', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await getMetrics());
  });

}

export default setupHealth;