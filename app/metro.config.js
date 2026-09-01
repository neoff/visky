// metro.config.js
//
// The desktop build runs the SAME source as the phone, bundled for platform
// `web` and wrapped in Electron. Four packages in the dependency tree are
// Android/iOS-only — they bundle happily and then throw at runtime, which is
// how the web target used to die on a white screen (`react-native-fast-image`
// calls `Image.resolveAssetSource`, which react-native-web does not implement).
//
// Rather than sprinkle `Platform.OS === 'web'` through six components, the
// module specifier itself is redirected here, and ONLY for platform `web`. The
// native builds resolve exactly what they resolved before this file existed.
const {getDefaultConfig} = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

/** package specifier -> the web stand-in that implements the part we use */
const webShims = {
  'react-native-fast-image': path.resolve(__dirname, 'src/shims/fast-image.web.tsx'),
  'react-native-mmkv-storage': path.resolve(__dirname, 'src/shims/mmkv.web.ts'),
  '@react-native-menu/menu': path.resolve(__dirname, 'src/shims/menu.web.tsx'),
  'react-native-webview': path.resolve(__dirname, 'src/shims/webview.web.tsx'),
  // login.tsx reaches into the package for a type. Babel normally elides a
  // type-only import, but the redirect costs nothing and removes the "normally".
  'react-native-webview/src/WebViewTypes': path.resolve(
    __dirname,
    'src/shims/webview.web.tsx',
  ),
}

const upstreamResolve = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = platform === 'web' ? webShims[moduleName] : undefined
  if (shim) return {type: 'sourceFile', filePath: shim}
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config
