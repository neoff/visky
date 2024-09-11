import {colors, fontSize} from "@/constants"
import {SplashScreen, Tabs} from "expo-router"
import React from "react"
import {BlurView} from "expo-blur";
import {StyleSheet} from "react-native";
import {FontAwesome, FontAwesome6, Ionicons, MaterialCommunityIcons} from "@expo/vector-icons";
import {FloatingPlayer} from "@/components/FloatingPlayer";

const TabsLayout = () => {
  console.log("===TabsLayout");
  SplashScreen.hideAsync()
  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarLabelStyle: {
            fontSize: fontSize.xs,
            fontWeight: '500',
          },
          headerShown: false,
          tabBarStyle: {
            position: 'absolute',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderTopWidth: 0,
            paddingTop: 8,
          },
          tabBarBackground: () => (
            <BlurView
              intensity={95}
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
            tabBarIcon: ({color}) => (
              <FontAwesome name="heart" size={20} color={color}/>
            ),
          }}
        />
        <Tabs.Screen
          name="(songs)"
          options={{
            title: 'Songs',
            tabBarIcon: ({color}) => (
              <Ionicons name="musical-notes-sharp" size={24} color={color}/>
            ),
          }}
        />
        <Tabs.Screen
          name="artists"
          options={{
            title: 'Artists',
            tabBarIcon: ({color}) => <FontAwesome6 name="users-line" size={20} color={color}/>,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({color}) => (
              <MaterialCommunityIcons name="account" size={28} color={color}/>
            ),
          }}
        />
      </Tabs>

      <FloatingPlayer
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: 78,
        }}
      />
    </>
  )
}

export default TabsLayout