import {colors, fonts, layout} from "@/constants"
import {Tabs} from "expo-router"
import React from "react"
import {ColorValue, StyleSheet, View} from "react-native";
import {FontAwesome, FontAwesome6, Ionicons, MaterialCommunityIcons} from "@expo/vector-icons";
import {FloatingPlayer} from "@/components/FloatingPlayer";
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function TabsLayout(){
  const {bottom} = useSafeAreaInsets()

  // One height for both platforms: a fixed content height plus the real bottom
  // inset. The mini player is pinned to exactly that height, so it always sits
  // flush on top of the tab bar instead of floating above it.
  const tabBarHeight = layout.tabBarContentHeight + bottom

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          // without this the inactive icons/labels fall back to a dark grey that
          // is invisible on the dark tab bar
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontSize: fonts.xs,
            lineHeight: fonts.xs + 4,
            fontWeight: fonts.weight as 500 | 600,
            margin: 0,
          },
          // fixed icon box: the glyphs have different intrinsic heights, so
          // without it the labels sit at a different baseline per tab
          tabBarIconStyle: {
            height: layout.tabIconSize,
            width: layout.tabIconSize,
          },
          tabBarItemStyle: {
            paddingVertical: 0,
            rowGap: 2,
          },
          headerShown: false,
          tabBarStyle: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            borderTopLeftRadius: layout.tabBarRadius,
            borderTopRightRadius: layout.tabBarRadius,
            borderTopWidth: 0,
            elevation: 0,
            paddingTop: 8,
            paddingBottom: bottom,
            height: tabBarHeight,
            backgroundColor: 'transparent',
          },
          // translucent plate drawn with an explicit rgba colour instead of a
          // BlurView: expo-blur renders at a different translucency on Android
          // (dimezisBlurView) than on iOS, which is what made the two bars differ
          tabBarBackground: () => (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: colors.surface,
                  borderTopLeftRadius: layout.tabBarRadius,
                  borderTopRightRadius: layout.tabBarRadius,
                  overflow: 'hidden',
                },
              ]}
            />
          ),
        }}
      >

        <Tabs.Screen
          name="favorites"
          options={{
            title: 'Favorites',
            tabBarIcon: ({color}: {color: ColorValue}) => (
              <FontAwesome name="heart" size={layout.tabIconSize} color={color}/>
            ),
          }}
        />
        <Tabs.Screen
          name="(songs)"
          options={{
            title: 'Songs',
            tabBarIcon: ({color}: {color: ColorValue}) => (
              <Ionicons name="musical-notes-sharp" size={layout.tabIconSize} color={color}/>
            ),
          }}
        />
        <Tabs.Screen
          name="artists"
          options={{
            title: 'Artists',
            tabBarIcon: ({color}: {color: ColorValue}) => <FontAwesome6 name="users-line" size={layout.tabIconSize} color={color}/>,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({color}: {color: ColorValue}) => (
              <MaterialCommunityIcons name="account" size={layout.tabIconSize} color={color}/>
            ),
          }}
        />
      </Tabs>

      <FloatingPlayer
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: tabBarHeight,
        }}
      />
    </>
  )
}
