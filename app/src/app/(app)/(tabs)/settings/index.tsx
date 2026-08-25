import {iconStyles, welcomeStyles} from "@/styles"
import {ActivityIndicator, Image, StyleSheet, Text, View} from "react-native"
import React, {useEffect, useState} from "react";
import Icon from "react-native-vector-icons/FontAwesome";
import {router} from "expo-router";
import {useSession} from "@/components/SessionProvider";
import {apiUrls, colors, fonts} from "@/constants";
import {loadProfile, VkProfile} from "@/helpers/network";

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

        <View style={styles.logout}>
          <Icon.Button
            name="sign-out"
            backgroundColor="rgba(255,255,255,.09)"
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
  logout: {
    marginTop: 28,
  },
})

export default SettingsScreen
