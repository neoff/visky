# Visky Web Pages

This directory contains static web pages for the Visky Music Player project.

## Pages

### 1. Landing Page (`index.html`)
**URL:** `https://visky.envarg.com/`

The main landing page that introduces Visky to potential users. Features:
- Responsive design that works on mobile and desktop
- Platform detection (iOS/Android/Desktop)
- QR codes for app downloads (placeholders for now)
- Feature highlights
- VK.com authentication requirement notice
- Download buttons for App Store and Google Play

**Key Sections:**
- Hero section with app description
- Feature grid (6 key features)
- VK.com authentication info box
- Download section with QR codes and store buttons
- Footer with links to EULA, Privacy Policy, and GitHub

### 2. EULA (`eula.html`)
**URL:** `https://visky.envarg.com/eula`

End User License Agreement required for App Store and Google Play submission. Complies with:
- Apple App Store Review Guidelines
- Google Play Developer Distribution Agreement
- GDPR requirements (for EEA users)

**Key Sections:**
- Application overview and third-party authentication
- **Data collection transparency:**
  - ✅ VK.com User ID (authentication)
  - ✅ Device ID (session management)
  - ❌ NO personal information, location, contacts, or analytics
- Content and copyright notices
- Service limitations and disclaimers
- User responsibilities
- App Store compliance statements

### 3. Privacy Policy (`privacy.html`)
**URL:** `https://visky.envarg.com/privacy`

Comprehensive privacy policy required for app store submissions. Fully compliant with:
- Apple App Privacy Details
- Google Play Data Safety requirements
- GDPR (EU General Data Protection Regulation)
- CCPA (California Consumer Privacy Act)

**Key Highlights:**
- **Data We Collect:**
  - VK.com User ID (7-day retention)
  - Device ID (7-day retention)
  - Access Token (auto-expires)
- **Data We DON'T Collect:**
  - No personal info, location, contacts, browsing history
  - No analytics, crash reports, or tracking
- Security measures (HTTPS, encrypted storage, auto-expiring sessions)
- GDPR rights for EEA users
- Children's privacy (relies on VK.com age verification)

### 4. Download Not Available (`not-available.html`)
**URL:** 
- `https://visky.envarg.com/download/ios`
- `https://visky.envarg.com/download/android`

Placeholder page shown when users try to download the app before it's published to stores.

**Future Implementation:**
When apps are published, update `src/router/web.ts` to redirect:
```typescript
// iOS redirect
router.get('/download/ios', (req, res) => {
  res.redirect('https://apps.apple.com/app/visky/id123456789');
});

// Android redirect
router.get('/download/android', (req, res) => {
  res.redirect('https://play.google.com/store/apps/details?id=com.visky.app');
});
```

## Routing

Routes are configured in `src/router/web.ts`:

```typescript
GET /              → index.html (landing page)
GET /eula          → eula.html (End User License Agreement)
GET /privacy       → privacy.html (Privacy Policy)
GET /download/ios  → not-available.html (or redirect to App Store)
GET /download/android → not-available.html (or redirect to Google Play)
```

## Design Features

### Responsive Design
- Mobile-first approach
- Breakpoints for tablet and desktop
- Platform-specific content (QR codes for desktop, direct buttons for mobile)

### Color Scheme
- Primary gradient: Purple to violet (`#667eea` → `#764ba2`)
- Accent colors: Gold (`#ffd700`) for VK links
- Semantic colors: Warning yellow for important notices

### Typography
- System fonts for optimal performance
- Clear hierarchy with size and weight variations
- High contrast for accessibility

### Interactive Elements
- Hover effects on cards and buttons
- Smooth transitions and transforms
- Platform detection with JavaScript

## App Store Requirements Checklist

### Apple App Store ✅
- [x] EULA with clear terms
- [x] Privacy Policy with App Privacy Details
- [x] Data collection transparency
- [x] Third-party service disclosure (VK.com)
- [x] Children's privacy statement
- [x] Contact information for support

### Google Play Store ✅
- [x] EULA compliant with Developer Distribution Agreement
- [x] Privacy Policy with Data Safety information
- [x] Data encryption disclosure (in-transit and at-rest)
- [x] Data deletion mechanism (logout)
- [x] Third-party data sharing disclosure (VK.com only)
- [x] No advertising or analytics tracking

### GDPR Compliance (EU) ✅
- [x] Legal basis for processing (consent, legitimate interest)
- [x] User rights clearly stated (access, erasure, portability)
- [x] Data retention periods specified (7 days)
- [x] International data transfer notice
- [x] Contact information for privacy inquiries
- [x] Right to withdraw consent (logout)

## Future Enhancements

### QR Code Implementation
Replace placeholder QR codes in `index.html`:

1. **Generate QR codes** for store URLs:
   ```bash
   # Using qrcode library (Node.js)
   npm install qrcode
   ```

2. **Update HTML** with actual QR code images or use JavaScript library:
   ```html
   <img src="/assets/qr-ios.png" alt="iOS QR Code">
   <img src="/assets/qr-android.png" alt="Android QR Code">
   ```

3. **Dynamic generation** option:
   - Add route `/qr/ios` and `/qr/android` that generate QR codes on-the-fly
   - Use `qrcode` or `qr-image` npm package

### Analytics (Privacy-Preserving)
If needed, consider adding privacy-focused analytics:
- Plausible Analytics (GDPR-compliant, no cookies)
- Simple page view counter (no personal data)
- **Update Privacy Policy** if any analytics are added

### Localization
Add support for multiple languages:
- Russian (для русскоязычной аудитории VK)
- English (current)
- Language switcher in header

### App Screenshots
Add screenshots section to landing page:
- Carousel of app screenshots
- Video demo of app in action
- Feature walkthroughs

## Testing

### Local Testing
```bash
# Start development server
cd visky-api
yarn dev

# Visit in browser
open http://localhost:3000
open http://localhost:3000/eula
open http://localhost:3000/privacy
```

### Production Testing
```bash
# Test on live server
curl https://visky.envarg.com/
curl https://visky.envarg.com/eula
curl https://visky.envarg.com/privacy
```

### Mobile Testing
Test responsive design:
- Chrome DevTools device emulation
- Real iOS device (Safari)
- Real Android device (Chrome)
- Tablet viewport
- Desktop viewport

### Accessibility Testing
- Screen reader compatibility (VoiceOver, TalkBack)
- Keyboard navigation
- Color contrast (WCAG AA compliance)
- Font scaling

## Maintenance

### When Updating Data Collection
If you change what data the app collects:

1. **Update Privacy Policy** (`privacy.html`)
   - Section 2: Information We Collect
   - Section 12: App Store Compliance

2. **Update EULA** (`eula.html`)
   - Section 3: Data Collection and Privacy

3. **Update App Store Listings:**
   - Apple: App Privacy Details in App Store Connect
   - Google: Data Safety in Google Play Console

4. **Increment "Last Updated" date** on both pages

### When Publishing to Stores
1. Update `src/router/web.ts` with actual store URLs
2. Generate and add QR codes to landing page
3. Test all download flows
4. Update `not-available.html` or remove it

## Legal Disclaimer

These documents are provided as templates and should be reviewed by a legal professional before use. Requirements vary by jurisdiction and app functionality. Always consult with legal counsel for:
- GDPR compliance (EU)
- CCPA compliance (California)
- COPPA compliance (children's privacy)
- Local data protection laws in your jurisdiction

## Links and Resources

### App Store Guidelines
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Google Play Developer Policy](https://play.google.com/about/developer-content-policy/)
- [Google Play Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469)

### Privacy Regulations
- [GDPR Official Text](https://gdpr-info.eu/)
- [CCPA Information](https://oag.ca.gov/privacy/ccpa)
- [COPPA Guidelines](https://www.ftc.gov/enforcement/rules/rulemaking-regulatory-reform-proceedings/childrens-online-privacy-protection-rule)

### VK.com
- [VK Privacy Policy](https://vk.com/privacy)
- [VK Terms of Service](https://vk.com/terms)
- [Frisky Radio VK Group](https://vk.com/audios-42311167)
