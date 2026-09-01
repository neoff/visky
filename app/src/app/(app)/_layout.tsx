import {Button, Text, View} from 'react-native';
import {Redirect, router, SplashScreen, Stack, useRouter} from 'expo-router';
import {apiUrls, authPage, colors} from "@/constants";
import React, {useCallback, useRef, useState} from "react";
import {useSetupTrackPlayer} from "@/hooks/useSetupTrackPlayer";
import {usePlaybackSync} from "@/hooks/usePlaybackSync";
import {useLogTrackPlayerState} from "@/hooks/useLogTrackPlayerState";
import {useSession} from "@/components/SessionProvider";
import {AuthFragments} from "@/types/auth";

export default function AppLayout() {
  const { getSession, isLoading } = useSession();
  const userSession: AuthFragments = getSession() as AuthFragments;

  // Joins this device to the account's playback session: it can be handed the
  // sound from another device, and it restores the last track on a cold start.
  // Hooks cannot sit behind the early returns below, so it runs unconditionally
  // and stays idle until there is a session to sync with.
  usePlaybackSync();

  if (isLoading) {
    console.log("--AppLayout=Loading...");
    return null
  }

  // Only require authentication within the (app) group's layout as users
  // need to be able to access the (auth) group and sign in again.
  if (!userSession || !userSession.access_token || !userSession.secret || !userSession.user_id) {
    // On web, static rendering will stop here as the user is not authenticated
    // in the headless Node process that the pages are rendered in.
    console.log("--AppLayout=Redirect to ", authPage);
    return <Redirect href={authPage} />;
  }
  SplashScreen.hideAsync()
  // Identity only. This used to print `userSession` whole, which put the VK
  // access_token and the audio-signing secret into Metro's output on every
  // render of the authenticated layout — the same leak network.tsx was fixed
  // for, from a second place. The secret is the worse half: the audio URL
  // signature is md5(url + secret) and it does not expire with the session.
  console.log("--AppLayout=Stack session:", userSession.user_id, userSession.device_id);
  const handleDismiss = () => {
    router.dismiss()
  };
  console.log("===AppLayout return");
  // This layout can be deferred because it's not the root layout.
  return (
    // contentStyle pins an OPAQUE background on every screen in this stack.
    // Without it the card is composited over the screen below, and during the
    // vertical dismiss gesture the (now translucent) mini player and tab bar of
    // the tabs screen bleed through the player as grey rectangles.
    <Stack screenOptions={{contentStyle: {backgroundColor: colors.background}}}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="player"
        options={{
          presentation: 'card',
          gestureEnabled: true,
          gestureDirection: 'vertical',
          animationDuration: 400,
          headerShown: false,
          contentStyle: {backgroundColor: colors.background},
          headerLeft: () => <Button onPress={handleDismiss} title="Close" />,
        }}
      />
    </Stack>
  )

  /*return (
    <View><Text style={{color:'#fff'}}>asdfasfd</Text></View>
  )*/
}