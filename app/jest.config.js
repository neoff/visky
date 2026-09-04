// jest.config.js
//
// The app's unit tests. The API has had a suite since milestone 01; this is the
// same idea on the client, and it exists because of a specific pattern in the
// bug reports: the same three or four failures kept coming back in different
// clothes — a queue that ends after one track, a tap the slider drops, a device
// that goes deaf to its own play button. Every test here is one of those,
// written from the report.
//
// Transformed by babel with the app's own preset rather than ts-jest: two of
// the defects live in PATCHES to node_modules (react-native-track-player's web
// player, @expo/vector-icons), and testing a patch means running the patched
// file, which is ESM and has to go through babel like everything else.
//
// Resolution is WEB-FIRST (`.web.ts` before `.ts`). That is where these bugs
// were found — the desktop shell runs the web bundle — and it is what picks the
// real web implementation of the track player for the vendor tests below.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  testMatch: ['**/src/__tests__/**/*.test.ts?(x)'],
  moduleFileExtensions: ['web.ts', 'web.tsx', 'web.js', 'ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    // The native modules, replaced by fakes with the same shape. None of them
    // can load outside a device: they bind to a JSI or a bridge that is not
    // there.
    '^react-native$': '<rootDir>/src/__tests__/__mocks__/react-native.tsx',
    '^react-native-track-player$': '<rootDir>/src/__tests__/__mocks__/trackPlayer.ts',
    // The package's own web player asks for its index by relative path. Left
    // alone that import runs the package back through its web entry point and
    // into the module that is asking — see the mock for what the cycle breaks.
    '^\\.\\./\\.\\./src$': '<rootDir>/src/__tests__/__mocks__/rntpWebIndex.ts',
    '^react-native-reanimated$': '<rootDir>/src/__tests__/__mocks__/reanimated.ts',
    '^react-native-awesome-slider$': '<rootDir>/src/__tests__/__mocks__/slider.tsx',
    '^react-native-gesture-handler$': '<rootDir>/src/__tests__/__mocks__/gestureHandler.tsx',
    '^react-native-safe-area-context$': '<rootDir>/src/__tests__/__mocks__/safeArea.ts',
    '^react-native-vector-icons/.*$': '<rootDir>/src/__tests__/__mocks__/vectorIconsLegacy.tsx',
    '^@expo/vector-icons$': '<rootDir>/src/__tests__/__mocks__/icons.tsx',
    '^expo-font$': '<rootDir>/src/__tests__/__mocks__/expo-font.ts',
    '^expo-constants$': '<rootDir>/src/__tests__/__mocks__/expo-constants.ts',
    '^expo-secure-store$': '<rootDir>/src/__tests__/__mocks__/expo-secure-store.ts',
    '^expo-asset$': '<rootDir>/src/__tests__/__mocks__/expo-asset.ts',
    '^expo-linking$': '<rootDir>/src/__tests__/__mocks__/expo-linking.ts',
    '^react-native-mmkv-storage$': '<rootDir>/src/__tests__/__mocks__/mmkv.ts',
    // Images are not JavaScript; the bundler turns them into an id, and that
    // is all any of this code does with them.
    '\\.(png|jpg|jpeg|gif|svg|ttf|otf)$': '<rootDir>/src/__tests__/__mocks__/asset.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // The two patched packages have to be compiled, not skipped: running the
  // patch is the whole point of the tests in __tests__/vendor.
  transformIgnorePatterns: [
    'node_modules/(?!(react-native-track-player|@expo/vector-icons|expo/virtual)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
}
