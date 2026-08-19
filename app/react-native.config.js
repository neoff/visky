module.exports = {
    dependencies: {
        'react-native-fast-image': {
            platforms: {
                android: {
                    packageImportPath: 'import com.dylanvann.fastimage.FastImageViewPackage;',
                    packageInstance: 'new FastImageViewPackage()',
                },
            },
        },
        'react-native-loader-kit': {
            platforms: {
                android: null,
            },
        },
        'react-native-mmkv-storage': {
            platforms: {
                android: null,
            },
        },
        'react-native-menu': {
            platforms: {
                android: null,
            },
        },
        'react-native-track-player': {
            platforms: {
                android: {
                    packageImportPath: 'import com.doublesymmetry.trackplayer.TrackPlayer;',
                    packageInstance: 'new TrackPlayer()',
                },
            },
        },
        'react-native-webview': {
            platforms: {
                android: {
                    packageImportPath: 'import com.reactnativecommunity.webview.RNCWebViewPackage;',
                    packageInstance: 'new RNCWebViewPackage()',
                },
            },
        },
    },
};
