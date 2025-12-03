import { Router } from 'express';
import path from 'path';

const router = Router();

// Landing page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// EULA page
router.get('/eula', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/eula.html'));
});

// Privacy Policy page
router.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/privacy.html'));
});

// Download redirects
router.get('/download/ios', (req, res) => {
  // TODO: Redirect to App Store when published
  // res.redirect('https://apps.apple.com/app/visky/...');
  res.sendFile(path.join(__dirname, '../../public/not-available.html'));
});

router.get('/download/android', (req, res) => {
  // TODO: Redirect to Google Play when published
  // res.redirect('https://play.google.com/store/apps/details?id=com.visky.app');
  res.sendFile(path.join(__dirname, '../../public/not-available.html'));
});

export default router;
