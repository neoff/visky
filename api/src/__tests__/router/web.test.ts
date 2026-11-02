// The landing page's own files.
//
// Every page here is sent by name and every QR code is a route, so the whole
// site could answer 200 while the DIRECTORY those pages reference answered 404
// for everything in it. That is exactly what happened: the icon was in the
// image, referenced correctly, and unreachable. Nothing failed loudly — three
// of the four images on the page were routes and loaded fine.
//
// So this asserts the mount, not the markup.
import express from 'express';
import request from 'supertest';
import webRouter, {DESTINATIONS} from '@/router/web';

const app = express();
app.use('/', webRouter);

describe('the landing page assets', () => {
  it('serves the icon the page references', async () => {
    const res = await request(app).get('/assets/images/visky-icon.png');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    // a real png, not an html error page with a 200 on it
    expect(res.body.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('serves the favicon', async () => {
    const res = await request(app).get('/assets/images/favicon.png');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });

  it('answers 404 for an asset that is not there', async () => {
    // fallthrough:false — the miss stops here instead of reaching a later route
    const res = await request(app).get('/assets/images/nothing-here.png');

    expect(res.status).toBe(404);
  });
});

// Where the buttons go. The point of asserting these is that the table is also
// what the QR codes are rendered from, so a wrong entry here is wrong in two
// places at once and only one of them is readable.
describe('the download redirects', () => {
  it('sends Android to Google Play, not to a release asset', async () => {
    const res = await request(app).get('/download/android');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(DESTINATIONS.android);
    expect(res.headers.location).toMatch(/play\.google\.com/);
  });

  it('serves the apk and the dmg from our own storage, not from GitHub', async () => {
    // the repository is private, so every github release asset answered 404
    // for everyone who was not signed in as its owner
    const apk = await request(app).get('/download/apk');
    const dmg = await request(app).get('/download/dmg');

    expect(apk.status).toBe(302);
    expect(dmg.status).toBe(302);
    expect(apk.headers.location).toBe(DESTINATIONS.apk);
    expect(dmg.headers.location).toBe(DESTINATIONS.dmg);
    for (const where of [apk.headers.location, dmg.headers.location]) {
      expect(where).toMatch(/^https:\/\/s3\.envarg\.com\//);
      expect(where).not.toMatch(/github\.com/);
    }
  });

  it('points the file links at a path that survives a release', async () => {
    // a version in the url is a url that goes stale on the next build, and the
    // QR codes on the page would go stale with it
    expect(DESTINATIONS.apk).toContain('/releases/latest/');
    expect(DESTINATIONS.dmg).toContain('/releases/latest/');
  });
});

describe('the QR codes', () => {
  // One case per door rather than a loop inside one case. Each png is a 512px
  // render at the highest error correction, and three of them in a row went
  // over jest's five second budget on a cold container -- which failed the
  // image build rather than the code.
  it.each(['ios', 'android', 'test'])('renders the %s code', async (door) => {
    const res = await request(app).get(`/qr/${door}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  }, 20_000);

  it('renders none for the files', async () => {
    // nobody installs an apk by pointing a phone at a laptop
    const res = await request(app).get('/qr/apk');

    expect(res.status).toBe(404);
  });
});
