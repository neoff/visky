import {Slot, SplashScreen} from 'expo-router';
import React from "react";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {GestureHandlerRootView} from "react-native-gesture-handler";
import {StatusBar} from "expo-status-bar";
import {SessionProvider} from "@/components/SessionProvider";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function Root() {

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