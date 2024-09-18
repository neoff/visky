import {Slot, SplashScreen} from 'expo-router';
import React, {useCallback, useState} from "react";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {GestureHandlerRootView} from "react-native-gesture-handler";
import {StatusBar} from "expo-status-bar";
import {SessionProvider, useSession} from "@/components/SessionProvider";
import {useLogTrackPlayerState} from "@/hooks/useLogTrackPlayerState";
import {useSetupTrackPlayer} from "@/hooks/useSetupTrackPlayer";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function Root() {
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

  console.log("--Root= return Slot");
  // Set up the auth context and render our layout inside of it.
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{flex: 1}}>
        <SessionProvider>
          <Slot />
        </SessionProvider>

        <StatusBar style="auto"/>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  )
}