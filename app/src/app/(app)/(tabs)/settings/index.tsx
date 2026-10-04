import {iconStyles, welcomeStyles} from "@/styles"
import {ActivityIndicator, Image, Pressable, StyleSheet, Switch, Text, View} from "react-native"
import React, {useCallback, useEffect, useState} from "react";
import Icon from "react-native-vector-icons/FontAwesome";
import {router} from "expo-router";
import {useSession} from "@/components/SessionProvider";
import {apiUrls, colors, fonts} from "@/constants";
import {loadProfile, syncFriskyFavorites, VkProfile} from "@/helpers/network";
import {usePlaybackStore} from "@/store/playback";
import {useSettingsStore} from "@/store/settings";

/**
 * The screen used to read `state.user` — a prop that a route component never
 * receives, so it always greeted "Welcome, undefined!" and rendered an <Image>
 * with no source. The profile is fetched now (`GET /api/auth/me`, four fields
 * off `users.get`), and the "or should we call you …?" line is gone: the second
 * line is the account the app is actually signed in as.
 */
const SettingsScreen = () => {
  const {signOut} = useSession();
  const [profile, setProfile] = useState<VkProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const devices = usePlaybackStore((store) => store.devices);

  useEffect(() => {
    let cancelled = false;
    loadProfile()
      .then((user) => {
        if (!cancelled) setProfile(user);
      })
      .catch((error) => console.warn('Unable to load the profile', error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The sweep: frisky tracks sitting loose in the VK library, moved into the
  // Frisky-favorites playlist the Favorites tab is made of. Automatic by
  // default — the tab runs it whenever "All" is opened — and this is where that
  // is turned off, and where it is run by hand once it is.
  const autoSync = useSettingsStore((state) => state.autoSyncFavorites);
  const setAutoSync = useSettingsStore((state) => state.setAutoSyncFavorites);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<string | null>(null);

  const runSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncReport(null);
    try {
      const result = await syncFriskyFavorites();
      if (result.status === 'skipped') {
        setSyncReport('Nothing to sync yet — the frisky catalogue is still being cached');
      } else if (result.added === 0) {
        setSyncReport('Already in sync');
      } else {
        // `remaining` is real: one sweep is capped so it cannot sit inside VK's
        // rate limit for minutes, and saying so is better than looking finished
        setSyncReport(
          `Added ${result.added} track${result.added === 1 ? '' : 's'}` +
          (result.remaining > 0 ? ` · ${result.remaining} left, run it again` : ''),
        );
      }
    } catch (error) {
      console.warn('Unable to sync the playlists', error);
      setSyncReport('Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  const logout = () => {
    signOut();
    router.replace('/');
  };

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');

  return (
    <View style={welcomeStyles.container}>
      <View style={welcomeStyles.content}>
        {loading ? (
          <ActivityIndicator color={colors.icon} style={{marginBottom: 24}}/>
        ) : (
          <View style={styles.avatarPlate}>
            {profile?.photo ? (
              <Image source={{uri: profile.photo}} style={styles.avatarImage}/>
            ) : (
              <Icon name="user" size={48} color={colors.textMuted}/>
            )}
          </View>
        )}

        <Text style={styles.greeting}>
          Welcome{name ? `, ${name}` : ''}!
        </Text>

        {profile && (
          <Text style={styles.identity}>
            {profile.screen_name ? `@${profile.screen_name}` : 'VK account'} · id {profile.id}
          </Text>
        )}

        {/* The browser and the desktop app cannot log in on their own — VK
            challenges the password grant from anything that is not a phone — so
            every other screen is signed in from here. It is a row rather than a
            button because it opens onto a list: what is already signed in as
            this account, and one more way in. */}
        <Pressable
          onPress={() => router.push('/settings/devices')}
          style={({pressed}) => [styles.menuRow, pressed && styles.menuPressed]}
        >
          <Icon name="mobile" size={22} color={colors.icon} style={styles.menuIcon}/>
          <View style={styles.menuText}>
            <Text style={styles.menuLabel}>Devices</Text>
            <Text style={styles.menuHint}>
              {devices.length > 1 ? `${devices.length} signed in` : 'Add a computer or another phone'}
            </Text>
          </View>
          <Icon name="chevron-right" size={14} color={colors.textMutedDarker}/>
        </Pressable>

        {/* Favourites that predate this app live loose in the VK library; the
            Favorites tab only shows the playlist. This is what moves them. */}
        <View style={styles.menuRow}>
          <Icon name="refresh" size={20} color={colors.icon} style={styles.menuIcon}/>
          <View style={styles.menuText}>
            <Text style={styles.menuLabel}>Sync favorites automatically</Text>
            <Text style={styles.menuHint}>
              When the Favorites tab is switched to All
            </Text>
          </View>
          <Switch
            value={autoSync}
            onValueChange={setAutoSync}
            trackColor={{false: colors.surfaceDivider, true: colors.primary}}
            thumbColor={colors.text}
          />
        </View>

        {/* Off means by hand, and this is the hand. Kept visible either way: a
            sweep is capped per run, so even an automatic one can be worth
            repeating from here. */}
        <Pressable
          onPress={runSync}
          disabled={syncing}
          style={({pressed}) => [styles.menuRow, styles.syncRow, pressed && styles.menuPressed]}
        >
          <Icon name="list" size={20} color={colors.icon} style={styles.menuIcon}/>
          <View style={styles.menuText}>
            <Text style={styles.menuLabel}>Synchronize playlists</Text>
            <Text style={styles.menuHint}>
              {syncReport ?? 'Move frisky tracks from your VK audio into Frisky-favorites'}
            </Text>
          </View>
          {syncing ? (
            <ActivityIndicator color={colors.icon}/>
          ) : (
            <Icon name="chevron-right" size={14} color={colors.textMutedDarker}/>
          )}
        </Pressable>

        <View style={styles.logout}>
          {/* The only thing on this screen that throws something away. */}
          <Icon.Button
            name="sign-out"
            backgroundColor={colors.primary}
            onPress={logout}
            {...iconStyles} >
            Logout
          </Icon.Button>
        </View>

        <Text style={welcomeStyles.text}>

          App url, {apiUrls.baseUrl}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  avatarPlate: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 20,
  },
  avatarImage: {
    width: 128,
    height: 128,
  },
  greeting: {
    color: colors.text,
    fontSize: fonts.base,
    fontWeight: '600',
    textAlign: 'center',
  },
  identity: {
    color: colors.textMuted,
    fontSize: fonts.sm,
    textAlign: 'center',
    marginTop: 6,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  menuPressed: {
    opacity: 0.7,
  },
  menuIcon: {
    width: 26,
  },
  menuText: {
    flex: 1,
  },
  menuLabel: {
    color: colors.text,
    fontSize: fonts.sm,
    fontWeight: '600',
  },
  menuHint: {
    color: colors.textMuted,
    fontSize: fonts.xs,
    marginTop: 2,
  },
  // the two sweep rows read as one block, so only the first keeps the gap
  syncRow: {
    marginTop: 8,
  },
  logout: {
    marginTop: 28,
  },
})

export default SettingsScreen
