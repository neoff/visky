import {Button, Text} from 'react-native';
import {Redirect, router, SplashScreen, Stack, useRouter} from 'expo-router';
import {apiUrls, authPage} from "@/constants";
import React, {useCallback, useRef, useState} from "react";
import {useSetupTrackPlayer} from "@/hooks/useSetupTrackPlayer";
import {useLogTrackPlayerState} from "@/hooks/useLogTrackPlayerState";
import {useSession} from "@/components/SessionProvider";

export default function AppLayout() {
  const [isPlayerInitialized, setIsPlayerInitialized] = useState(false);
  const handleTrackPlayerLoaded = useCallback(() => {
    setIsPlayerInitialized(true)
    SplashScreen.hideAsync()
  }, [])

  useSetupTrackPlayer({
    onLoad: handleTrackPlayerLoaded,
    init: isPlayerInitialized,
  })
  useLogTrackPlayerState()
  const { getSession, isLoading } = useSession();
  const userSession = getSession();

  // You can keep the splash screen open, or render a loading screen like we do here.
  if (isLoading) {
    console.log("--AppLayout=Loading...");
    return null
  }
  console.log("===AppLayout");

  // Only require authentication within the (app) group's layout as users
  // need to be able to access the (auth) group and sign in again.
  if ( !userSession ) {
    // On web, static rendering will stop here as the user is not authenticated
    // in the headless Node process that the pages are rendered in.
    console.log("--AppLayout=Redirect to ", authPage);
    return <Redirect href={authPage} />;
  }

  console.log("--AppLayout=Stack session: ", userSession);
  const handleDismiss = () => {
    router.dismiss()
  };
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
          animationDuration: 400,
          headerShown: false,
          headerLeft: () => <Button onPress={handleDismiss} title="Close" />,
        }}
      />
    </Stack>
  )
}