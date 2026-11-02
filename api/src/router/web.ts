import express, { Response, Router } from 'express';
import path from 'path';
import QRCode from 'qrcode';

const router = Router();

// Helper to get public directory path
// In production (bundled), public/ is at the same level as index.js
// In development, it's at ../../public relative to dist/router/web.js
const getPublicPath = () => {
  // When bundled by esbuild, __dirname will be /app (where index.js is)
  // In development, __dirname will be /app/dist/router
  const isProduction = process.env.NODE_ENV === 'production' || !__dirname.includes('dist');
  return isProduction ? path.join(process.cwd(), 'public') : path.join(__dirname, '../../public');
};

/**
 * Where every "get the app" button and every QR code on the landing page ends
 * up. One table, because a store link that is right in the button and wrong in
 * the code is worse than no code at all.
 *
 * Two doors per platform, and the difference matters. `ios` and `android` are
 * the STORES — the listing a phone updates itself from. `apk` and `dmg` are the
 * files, served from the cluster's own MinIO (namespace `s3`, public at
 * s3.envarg.com) rather than from a GitHub release: the repository is private,
 * so every release asset 404'd for everyone who was not signed in as the owner.
 *
 * The file urls point at `releases/latest/`, a copy the deploy overwrites, so
 * the landing page and its QR codes never carry a version number that goes
 * stale. The versioned originals stay beside it under `releases/<version>/`.
 *
 * `test` is the Play opt-in link. It only works for an invited account, and it
 * is what the public Play listing falls back to while the production track is
 * still empty.
 */
export const DESTINATIONS = {
  ios: 'https://apps.apple.com/app/id6808513521',
  android: 'https://play.google.com/store/apps/details?id=com.envarg.visky',
  test: 'https://play.google.com/apps/testing/com.envarg.visky',
  apk: 'https://s3.envarg.com/visky/releases/latest/visky.apk',
  dmg: 'https://s3.envarg.com/visky/releases/latest/visky.dmg',
} as const;

/**
 * The codes the page actually shows. The two files are reached by a button
 * under the cards, not by camera — an apk is not something anyone installs by
 * pointing a phone at a laptop, and a dmg even less so.
 */
export const QR_DESTINATIONS = ['ios', 'android', 'test'] as const;

type Destination = keyof typeof DESTINATIONS;

/**
 * The files the pages actually ask for.
 *
 * Each page above is sent BY NAME, which is why they work and why the icon did
 * not: nothing ever served the DIRECTORY those pages reference, so every
 * /assets/... url answered 404 while the file sat in the image unreachable.
 * The QR codes hid it for months — they are routes rather than files, so three
 * of the four images on the landing page loaded and the fourth read as a bad
 * icon rather than a missing mount.
 *
 * Scoped to /assets, not mounted at the root. A static mount at / sits in front
 * of every route registered after it and would answer for any api path that
 * happened to match a filename on disk.
 *
 * `fallthrough: false` so a missing asset is a 404 from here, with the path in
 * it, instead of falling through to whatever matches next.
 */
router.use(
  '/assets',
  express.static(path.join(getPublicPath(), 'assets'), {
    maxAge: '1d',
    fallthrough: false,
  }),
);

// Landing page
router.get('/', (req, res) => {
  res.sendFile(path.join(getPublicPath(), 'index.html'));
});

// EULA page
router.get('/eula', (req, res) => {
  res.sendFile(path.join(getPublicPath(), 'eula.html'));
});

// The public report list. Linked from the form's confirmation rather than
// from the nav: it is for someone holding a ticket number, not a visitor.
router.get('/reports', (req, res) => {
  res.sendFile(path.join(getPublicPath(), 'reports.html'));
});

// Privacy Policy page
router.get('/privacy', (req, res) => {
  res.sendFile(path.join(getPublicPath(), 'privacy.html'));
});

// Download redirects. 302, not 301: these targets move (a new release, a Play
// listing that goes public) and a permanent redirect would be cached in
// people's browsers long after it stopped being true.
router.get('/download/ios', (req, res) => res.redirect(302, DESTINATIONS.ios));
router.get('/download/android', (req, res) => res.redirect(302, DESTINATIONS.android));
router.get('/testing/android', (req, res) => res.redirect(302, DESTINATIONS.test));
router.get('/download/apk', (req, res) => res.redirect(302, DESTINATIONS.apk));
router.get('/download/dmg', (req, res) => res.redirect(302, DESTINATIONS.dmg));

/**
 * The QR codes the landing page shows beside each button.
 *
 * Rendered here rather than shipped as images so they can never disagree with
 * the redirects above: both read the same table. Cached for a day — the png is
 * a pure function of the url, and the url changes with a deploy.
 */
const sendQr = async (destination: Destination, res: Response) => {
  const png = await QRCode.toBuffer(DESTINATIONS[destination], {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 512,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(png);
};

for (const destination of QR_DESTINATIONS) {
  router.get(`/qr/${destination}`, async (req, res) => {
    try {
      await sendQr(destination, res);
    } catch (error) {
      console.error(`Error generating the ${destination} QR code:`, error);
      res.status(500).send('Error generating QR code');
    }
  });
}

export default router;
