# Visky Project - Copilot Instructions

## Project Overview
**Visky** is a dual-workspace music player ecosystem consisting of:
- **visky/** - React Native (Expo) mobile app for iOS/Android
- **visky-api/** - Express.js backend API that proxies VK Music API

The app plays Frisky Radio content stored in VK Music, with OAuth authentication flow.

## Architecture

### Mobile App (visky/)
- **Framework**: Expo SDK 53 + React Native 0.79 + TypeScript
- **Routing**: File-based routing with `expo-router` (v5)
  - `src/app/_layout.tsx` - Root layout with TrackPlayer setup
  - `src/app/(auth)/` - Authentication screens (welcome, login)
  - `src/app/(app)/(tabs)/` - Main tabbed interface (favorites, songs, shows, settings)
- **State Management**: Zustand with MMKV persistence (`src/store/`)
  - `library.tsx` - Track library with async MMKV storage (key: 'tracks', instanceID: 'playlist')
  - `queue.tsx` - Active queue tracking
  - Uses `react-native-mmkv-storage` with `MMKVLoader` for async operations
- **Audio**: `react-native-track-player` v4.1.1 with custom Android plugin (`src/plugins/with-trackplayer-service.js`)
  - Requires patch (see `patches/react-native-track-player+4.1.1.patch`)
  - Applied via `patch-package` in postinstall hook
  - Setup hook: `useSetupTrackPlayer` in hooks
- **Auth**: Custom session provider (`src/components/SessionProvider.tsx`) using MMKV storage
  - Keys: 'auth_url', 'session' (stores JSON with access_token, secret, user_id)

### Backend API (visky-api/)
- **Framework**: Express.js + TypeScript + TypeORM (PostgreSQL)
- **VK Integration**: Emulates old Android VK client for authentication
  - Headers: `VKAndroidApp/4.13.1-1206` (see `src/helper/index.ts`)
  - Custom signature algorithm with MD5 hashing (`src/helper/vk.ts`)
- **Key Routes** (`src/router/`):
  - `/auth/vk` - OAuth flow emulation (`authForm.ts`)
  - `/api/playlist/frisky` - Main playlist endpoint (owner: -42311167)
  - `/api/playlist/favorites` - User favorites management (GET/PUT/DELETE)
- **Data Transform** (in `src/helper/index.ts`):
  - `cleanupDataAndSortPart()` - Removes "FRISKY | " prefix, sorts "Part N" tracks sequentially
  - `formatPlaylist()` - Converts VK format to app TrackItem schema with HLS type

## Path Aliases
Both projects use `@/*` for `src/*` imports (configured in `tsconfig.json`).

## Critical Workflows

### Development
```bash
# Mobile (visky/)
yarn generate          # Generate OpenAPI client from https://visky.envarg.com/v3/api-docs
yarn ios               # Run on iOS device (uses expo run:ios --device)
yarn android           # Run on Android device (uses expo run:android --device)
yarn test              # Run Jest with coverage (required before builds)
yarn postinstall       # Auto-runs patch-package to apply react-native-track-player patch

# Backend (visky-api/)
yarn dev               # tsx watch mode on src/index.ts
yarn generate          # Generate OpenAPI types from docs/openapi.yaml to src/__genedated__/
yarn test              # Jest tests with coverage
```

### Building & Deployment
```bash
# Mobile - uses EAS Build (eas.json profiles: development, preview, production)
yarn build:local       # Local APK build with preview profile
                      # 1. Runs tests (fails if tests fail)
                      # 2. Builds APK to android/build/visky-{version}-{versionCode}.apk
                      # 3. Auto-increments both android.versionCode and ios.versionCode in app.json
yarn deploy           # Submit latest APK to Google Play internal track (preview profile)
                      # Uses .credentials/google-play-service-account.json

# Backend
yarn build            # Full production build pipeline:
                      # 1. Generate OpenAPI types
                      # 2. Run tests with coverage
                      # 3. Bundle to dist/index.js using esbuild (minified, node20 target)
```

**Version Management**: 
- `app.json` tracks `version` (semver) and separate `android.versionCode` + `ios.versionCode` (integers)
- Build scripts auto-increment BOTH versionCodes after successful build
- Use `yarn app:version` to check current version string

## Project-Specific Conventions

### Code Generation
- **Never edit** `src/__genedated__/` folders - auto-generated from OpenAPI specs
- Mobile client: `openapi-typescript-codegen` generates from `https://visky.envarg.com/v3/api-docs`
- Backend types: `openapi-typescript-codegen` from `docs/openapi.yaml`
- Both use `--useOptions --client axios` flags for generated code

### Testing
- Both projects: Jest with `ts-jest`, coverage collection required
- Test pattern: `**/__tests__/**/*.test.ts`
- Module name mapper: `@/*` → `<rootDir>/src/*`
- Axios is mocked in tests (see `__tests__/__mocks__/axios.ts`)
- Coverage excludes: `*.d.ts`, `__tests__/`, `__mocks__/`

### Android Specifics
- **NDK version**: 26.3.11579264 (CRITICAL - hardcoded in `eas.json` and `app.json`)
- **EAS Build image**: `ubuntu-22.04-jdk-17-ndk-r26b`
- **SDK versions**: compileSdk 35, targetSdk 35, minSdk 24
- **Custom plugin required**: TrackPlayer service needs Android manifest modifications
- **Permissions**: WAKE_LOCK, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK
- **Known issue**: Player instability on cold start

### VK API Integration
- **Authentication**: Custom flow mimicking old Android app (not standard OAuth2)
  - User-Agent: `VKAndroidApp/4.13.1-1206 (Android 4.4.3; SDK 19; armeabi; ; ru)`
- **Session storage**: Express sessions with 1-week cookie lifetime
- **Request signing**: MD5 hash of URL + secret (see `vkMethod` in `src/helper/vk.ts`)
- **Middleware**: `checkAuthAndroid` validates session or `x-auth-token` header
- **Device ID**: 16-char random string from `[a-z0-9]` alphabet

## Data Flow
1. User authenticates via `/auth/vk` (backend scrapes VK auth page)
2. Backend stores session with `access_token`, `secret`, `user_id`, `device_id`
3. Mobile app stores session in MMKV, includes in API requests
4. Playlist fetched from VK group -42311167, transformed, cached in MMKV
5. TrackPlayer streams HLS audio directly from VK CDN URLs

## Known Issues
- Android player instability on cold start (mentioned in README)
- `visky-api/README.md` contains outdated Create React App boilerplate (ignore)

## File Naming Patterns
- Expo Router: Use parentheses for route groups: `(app)/`, `(tabs)/`, `(auth)/`
- Components: PascalCase `.tsx` files
- Stores: lowercase `.tsx` (due to JSX for type inference with Zustand)
- Scripts: `.sh` with chmod +x requirement

## Environment Variables
- Mobile: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_DEV` (set in `eas.json` per profile)
  - Development profile also sets `EXPO_PUBLIC_LPI_URL` and `EXPO_PUBLIC_LPI_ANDROID_URL` for local API
- Backend: `.env` file for `PORT`, database config (see `src/configurations/typeorm.config.ts`)

## Critical Dependencies & Patches
- **patch-package**: Auto-applies patches in postinstall
  - `react-native-track-player+4.1.1.patch` - Required for Android foreground service
- **MMKV Storage**: 
  - Create instance with `new MMKVLoader().withInstanceID('playlist').initialize()`
  - Use `getArrayAsync<T>()` for async array retrieval
- **Expo Config Plugins**: Custom plugin at `src/plugins/with-trackplayer-service.js` modifies AndroidManifest.xml
