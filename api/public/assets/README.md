# Visky Assets

This directory contains static assets for the Visky landing page and web pages.

## Directory Structure

```
assets/
├── css/          # Stylesheets (if separated from HTML)
├── images/       # Static images, logos, screenshots
└── js/           # JavaScript files (if separated from HTML)
```

## Images

### Screenshots
Place app screenshots here for the landing page carousel:
- `screenshot-library.png` - Music library view
- `screenshot-favorites.png` - Favorites view
- `screenshot-shows.png` - Radio shows view
- `screenshot-player.png` - Now playing view

Recommended dimensions:
- Width: 1080px (3x iOS resolution)
- Height: 1920px (iPhone aspect ratio)
- Format: PNG with transparency or JPG

### Logo
- `logo.png` - App logo for header (if replacing emoji)
- Size: 512x512px minimum

### QR Codes
QR codes are dynamically generated via `/qr/ios` and `/qr/android` routes.
No static QR code files needed.

## CSS

If you want to extract CSS from `index.html` into a separate file:

1. Create `assets/css/landing.css`
2. Move all `<style>` content to the file
3. Update `index.html`:
   ```html
   <link rel="stylesheet" href="/assets/css/landing.css">
   ```

## JavaScript

If you want to extract JavaScript from `index.html`:

1. Create `assets/js/platform-detect.js`
2. Move platform detection logic
3. Update `index.html`:
   ```html
   <script src="/assets/js/platform-detect.js"></script>
   ```

## Usage in HTML

Reference assets using absolute paths from `/assets/`:

```html
<!-- Images -->
<img src="/assets/images/screenshot-library.png" alt="Music Library">

<!-- CSS -->
<link rel="stylesheet" href="/assets/css/landing.css">

<!-- JavaScript -->
<script src="/assets/js/app.js"></script>
```

## Serving Static Files

Assets are served via Express static middleware configured in `src/index.ts`:

```typescript
app.use(express.static(path.join(__dirname, 'public')));
```

This makes `/assets/*` accessible at `https://visky.envarg.com/assets/*`

## Optimization

### Images
- Use WebP format for better compression
- Provide multiple sizes for responsive images
- Lazy load images below the fold

### CSS
- Minify CSS in production
- Inline critical CSS for faster first paint
- Use CSS modules if separating styles

### JavaScript
- Minify and bundle JS files
- Use defer or async loading
- Consider code splitting for larger apps

## Cache Headers

Static assets are served with cache headers (configured in Express):
- `Cache-Control: public, max-age=31536000` for versioned assets
- `Cache-Control: public, max-age=86400` for images

## TODO

- [ ] Add actual app screenshots
- [ ] Create app logo image
- [ ] Optimize images (compression, WebP)
- [ ] Extract CSS to separate file
- [ ] Add favicon.ico
- [ ] Add apple-touch-icon.png for iOS
- [ ] Add Open Graph images for social sharing
