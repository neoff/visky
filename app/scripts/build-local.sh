#!/bin/bash
set -e

APP_VERSION=$(node -e "const app = require('./app.json'); console.log(app.expo.version+'-'+app.expo.android.versionCode)")
echo "Building APK: visky-$APP_VERSION"


yarn test
yarn eas build --platform android --local --profile preview --non-interactive --output android/build/visky-${APP_VERSION}.apk
APP_VERSION=$(node -e "const fs = require('fs'); const app = require('./app.json'); app.expo.android.versionCode = (app.expo.android.versionCode || 1) + 1; app.expo.ios.versionCode = (app.expo.ios.versionCode || 1) + 1; fs.writeFileSync('app.json', JSON.stringify(app, null, 2)); console.log(app.expo.version+'-'+app.expo.android.versionCode)")