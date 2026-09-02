import {View} from 'react-native';
import {Slot, SplashScreen} from 'expo-router';
import React, {useCallback, useEffect, useState} from "react";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {GestureHandlerRootView} from "react-native-gesture-handler";
import {StatusBar} from "expo-status-bar";
import {SessionProvider, useSession} from "@/components/SessionProvider";
import {DESKTOP_TITLEBAR_HEIGHT, DesktopTitleBar} from "@/components/DesktopChrome";
import {useLogTrackPlayerState} from "@/hooks/useLogTrackPlayerState";
import {useSetupTrackPlayer} from "@/hooks/useSetupTrackPlayer";
import {startCarLink} from "@/services/car";

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

  // CarPlay and Android Auto, from app start rather than from the playback
  // service alone. A head unit can be plugged in before anything has played,
  // and the playback service does not exist until setupPlayer has run — the
  // car would sit on a placeholder that never resolved. Idempotent, so the
  // playback service's own call is still the one that wires up player events.
  useEffect(() => {
    startCarLink()
  }, [])

  console.log("--Root= return Slot");
  // Set up the auth context and render our layout inside of it.
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{flex: 1}}>
        {/* The desktop window has no system title bar (see DesktopChrome):
            this draws the strip it is dragged by and indents the app out from
            under the traffic lights. Zero-height everywhere else. */}
        <DesktopTitleBar />
        <SessionProvider>
          <View style={{flex: 1, paddingTop: DESKTOP_TITLEBAR_HEIGHT}}>
            <Slot />
          </View>
        </SessionProvider>

        <StatusBar style="auto"/>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  )
}