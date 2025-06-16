const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withTrackPlayerService(config) {
    return withAndroidManifest(config, (config) => {
        const app = config.modResults.manifest.application.find(
            (item) => item.$['android:name'] === '.MainApplication'
        );

        // Добавим нужные permissions
        const requiredPermissions = [
            'android.permission.WAKE_LOCK',
            'android.permission.FOREGROUND_SERVICE',
            'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
        ];

        config.modResults.manifest['uses-permission'] ??= [];

        for (const permission of requiredPermissions) {
            const alreadyExists = config.modResults.manifest['uses-permission'].some(
                (p) => p.$['android:name'] === permission
            );
            if (!alreadyExists) {
                config.modResults.manifest['uses-permission'].push({
                    $: { 'android:name': permission },
                });
            }
        }

        // Добавим сервис TrackPlayer
        app.service ??= [];
        const hasService = app.service.some(
            (s) =>
                s.$['android:name'] ===
                'com.doublesymmetry.trackplayer.service.TrackPlayerService'
        );
        if (!hasService) {
            app.service.push({
                $: {
                    'android:name':
                        'com.doublesymmetry.trackplayer.service.TrackPlayerService',
                    'android:exported': 'false',
                    'android:foregroundServiceType': 'mediaPlayback',
                },
            });
        }

        return config;
    });
};