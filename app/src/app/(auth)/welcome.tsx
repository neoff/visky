import React, {useState} from "react";
import {Text, View} from "react-native";
import Icon from "react-native-vector-icons/FontAwesome";
import {defaultStyles, iconStyles, welcomeStyles} from "@/styles";
import {Link, SplashScreen} from "expo-router";
import {fonts, modifiers, size} from "@/constants";

const WelcomeNavigation = () => {
  console.log("===WelcomeNavigation");
  SplashScreen.hideAsync()
  return (
    <View style={welcomeStyles.container}>
      <View style={welcomeStyles.content}>
        <Text style={welcomeStyles.header}>
          Welcome Stranger!
        </Text>
        <View style={welcomeStyles.avatar}>
          <Icon name="user-circle" size={100 + size.image} color="rgba(255,255,255,.09)"/>
        </View>
        <Text style={welcomeStyles.text}>
          Please log in to continue{'\n'}to continue work with app.
        </Text>
        {/* Login buttons */}
        <View style={welcomeStyles.buttons}>
          <View style={welcomeStyles.login_button}>
            <Link href="/login" asChild>
              <Icon.Button
                name="vk"
                backgroundColor="rgba(255,255,255,.09)"
                size={20 + modifiers.icons}
                {...iconStyles}>
                <Text style={{...defaultStyles.text, fontSize: fonts.xs}}>Login with Vk</Text>
              </Icon.Button>
            </Link>
          </View>
        </View>
      </View>
    </View>
  )
}

export default WelcomeNavigation;

