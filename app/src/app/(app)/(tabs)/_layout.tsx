import {colors, fonts, modifiers, size} from "@/constants"
import {SplashScreen, Tabs} from "expo-router"
import React, {useCallback, useEffect, useState} from "react"
import {BlurView} from "expo-blur";
import {StyleSheet} from "react-native";
import {FontAwesome, FontAwesome6, Ionicons, MaterialCommunityIcons} from "@expo/vector-icons";
import {FloatingPlayer} from "@/components/FloatingPlayer";
import {useSetupTrackPlayer} from "@/hooks/useSetupTrackPlayer";
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function TabsLayout(){
  const {top, bottom} = useSafeAreaInsets()
  console.log("===TabsLayout");

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarLabelStyle: {
            fontSize: fonts.xs,
            fontWeight: fonts.weight as 500 | 600,
          },
          headerShown: false,
          tabBarStyle: {
            position: 'absolute',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderTopWidth: 0,
            paddingTop: 8,
            paddingBottom: 30,
            height: size.base + 78,
          },
          tabBarBackground: () => (
            <BlurView
              intensity={95}
              tint={'dark'}
              experimentalBlurMethod={'dimezisBlurView'}
              style={{
                ...StyleSheet.absoluteFillObject,
                overflow: 'hidden',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
              }}
            />
          ),
        }}
      >

        <Tabs.Screen
          name="favorites"
          options={{
            title: 'Favorites',
            tabBarIcon: ({color}: {color: string}) => (
              <FontAwesome name="heart" size={20 + modifiers.icons} color={color}/>
            ),
          }}
        />
        <Tabs.Screen
          name="(songs)"
          options={{
            title: 'Songs',
            tabBarIcon: ({color}: {color: string}) => (
              <Ionicons name="musical-notes-sharp" size={24 + modifiers.icons} color={color}/>
            ),
          }}
        />
        <Tabs.Screen
          name="artists"
          options={{
            title: 'Artists',
            tabBarIcon: ({color}: {color: string}) => <FontAwesome6 name="users-line" size={20 + modifiers.icons} color={color}/>,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({color}: {color: string}) => (
              <MaterialCommunityIcons name="account" size={28 + modifiers.icons} color={color}/>
            ),
          }}
        />
      </Tabs>

      <FloatingPlayer
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: bottom+96,
        }}
      />
    </>
  )
}
