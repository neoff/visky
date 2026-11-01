import {colors, fonts, layout} from "@/constants"
import {Tabs} from "expo-router"
import React, {useEffect} from "react"
import {AppState, ColorValue, StyleSheet, View} from "react-native";
import {FontAwesome, FontAwesome6, Ionicons, MaterialCommunityIcons} from "@expo/vector-icons";
import {FloatingPlayer} from "@/components/FloatingPlayer";
import {UpdateBanner} from "@/components/UpdateBanner";
import {checkForUpdate} from "@/store/update";
import {useLastActiveTrack} from "@/hooks/useLastActiveTrack";
import {useActiveTrack} from "react-native-track-player";
import {useSafeAreaInsets} from "react-native-safe-area-context";

export default function TabsLayout(){
  const {bottom} = useSafeAreaInsets()

  // Asked once on the way in, and again whenever the app comes back to the
  // front. The second one is the case that matters: a phone that spent a week
  // in a pocket between shows was launched long before the release it is now
  // behind, and nothing else would ever ask again.
  useEffect(() => {
    checkForUpdate()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForUpdate()
    })
    return () => subscription.remove()
  }, [])

  // One height for both platforms: a fixed content height plus the real bottom
  // inset. The mini player is pinned to exactly that height, so it always sits
  // flush on top of the tab bar instead of floating above it.
  const tabBarHeight = layout.tabBarContentHeight + bottom

  // The mini player renders whenever there is a current-or-last track — the same
  // condition FloatingPlayer uses to bail out. While it is docked on top of the
  // tab bar, the bar's rounded top corners leave two little gaps at the sides
  // where the list shows through; square them off so the two plates read as one.
  const activeTrack = useActiveTrack()
  const lastActiveTrack = useLastActiveTrack()
  const hasMiniPlayer = Boolean(activeTrack ?? lastActiveTrack)
  const tabBarRadius = hasMiniPlayer ? 0 : layout.tabBarRadius

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
            borderTopLeftRadius: tabBarRadius,
            borderTopRightRadius: tabBarRadius,
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
                  borderTopLeftRadius: tabBarRadius,
                  borderTopRightRadius: tabBarRadius,
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

      {/* Above the mini player, on the same stack of plates: the notice is
          furniture, not a dialog, and it must never cover the transport. */}
      <UpdateBanner
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: tabBarHeight + (hasMiniPlayer ? layout.floatingPlayerHeight : 0),
        }}
      />
    </>
  )
}
