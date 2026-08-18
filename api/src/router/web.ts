import { Router } from 'express';
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

// QR Code generation routes
router.get('/qr/ios', async (req, res) => {
  try {
    // TODO: Replace with actual App Store URL when published
    const appStoreUrl = 'https://visky.envarg.com/download/ios';
    const qrCodeDataUrl = await QRCode.toDataURL(appStoreUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 2,
      width: 300,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    // Convert data URL to buffer
    const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');
    
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(imgBuffer);
  } catch (error) {
    console.error('Error generating iOS QR code:', error);
    res.status(500).send('Error generating QR code');
  }
});

router.get('/qr/android', async (req, res) => {
  try {
    // TODO: Replace with actual Google Play URL when published
    const playStoreUrl = 'https://visky.envarg.com/download/android';
    const qrCodeDataUrl = await QRCode.toDataURL(playStoreUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 2,
      width: 300,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    // Convert data URL to buffer
    const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');
    
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(imgBuffer);
  } catch (error) {
    console.error('Error generating Android QR code:', error);
    res.status(500).send('Error generating QR code');
  }
});

export default router;
