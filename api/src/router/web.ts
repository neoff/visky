import { Response, Router } from 'express';
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
 * Android has two doors on purpose. The Play listing is in CLOSED TESTING —
 * Google gates production behind twelve testers for fourteen days — so the
 * public door is the signed apk attached to the project's GitHub release, and
 * the Play door is the opt-in link, which only works for an invited account.
 */
export const DESTINATIONS = {
  ios: 'https://apps.apple.com/app/id6808513521',
  android: 'https://github.com/neoff/visky/releases/latest/download/visky.apk',
  test: 'https://play.google.com/apps/testing/com.envarg.visky',
} as const;

type Destination = keyof typeof DESTINATIONS;

// Landing page
router.get('/', (req, res) => {
  res.sendFile(path.join(getPublicPath(), 'index.html'));
});

// EULA page
router.get('/eula', (req, res) => {
  res.sendFile(path.join(getPublicPath(), 'eula.html'));
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

for (const destination of Object.keys(DESTINATIONS) as Destination[]) {
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
