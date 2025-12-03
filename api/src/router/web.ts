import { Router } from 'express';
import path from 'path';

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

// Download redirects
router.get('/download/ios', (req, res) => {
  // TODO: Redirect to App Store when published
  // res.redirect('https://apps.apple.com/app/visky/...');
  res.sendFile(path.join(getPublicPath(), 'not-available.html'));
});

router.get('/download/android', (req, res) => {
  // TODO: Redirect to Google Play when published
  // res.redirect('https://play.google.com/store/apps/details?id=com.visky.app');
  res.sendFile(path.join(getPublicPath(), 'not-available.html'));
});

export default router;
