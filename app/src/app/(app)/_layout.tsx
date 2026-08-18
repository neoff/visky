// src/(app)/_layout.tsx
import {Button, Platform, Text, View} from 'react-native';
import {Redirect, router, SplashScreen, Stack, useRouter} from 'expo-router';
import {apiUrls, authPage} from "@/constants";
import React, {useCallback, useRef, useState} from "react";
import {useSetupTrackPlayer} from "@/hooks/useSetupTrackPlayer";
import {useLogTrackPlayerState} from "@/hooks/useLogTrackPlayerState";
import {useSession} from "@/components/SessionProvider";
import {AuthFragments} from "@/types/auth";

export default function AppLayout() {
  const { getSession, isLoading } = useSession();
  const userSession: AuthFragments = getSession() as AuthFragments;

  if (isLoading) {
    console.log("--AppLayout=Loading...");
    return null
  }

  // Only require authentication within the (app) group's layout as users
  // need to be able to access the (auth) group and sign in again.
  if (!userSession || !userSession.access_token || !userSession.user_id) {
    // On web, static rendering will stop here as the user is not authenticated
    // in the headless Node process that the pages are rendered in.
    console.log("--AppLayout=Redirect to ", authPage);
    return <Redirect href={authPage} />;
  }
  SplashScreen.hideAsync()
  console.log("--AppLayout=Stack session: ", userSession);
  console.log("===AppLayout return");
  // This layout can be deferred because it's not the root layout.
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="player"
        options={{
          presentation: 'card',
          gestureEnabled: true,
          gestureDirection: 'vertical',
          animationDuration: 500,
          headerShown: false,
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  )

  /*return (
    <View><Text style={{color:'#fff'}}>asdfasfd</Text></View>
  )*/
}