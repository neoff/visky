import React from "react";
import {Image, ScrollView, Text, View} from "react-native";
import Icon from "react-native-vector-icons/FontAwesome";
import {defaultStyles, iconStyles, welcomeStyles} from "@/styles";
import {Link, SplashScreen} from "expo-router";
import {fonts, modifiers} from "@/constants";
import logo from "@/assets/logo.png";

const WelcomeNavigation = () => {
  console.log("===WelcomeNavigation");
  SplashScreen.hideAsync()
  return (
    <View style={welcomeStyles.container}>
      <ScrollView
        contentContainerStyle={welcomeStyles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={welcomeStyles.header}>
          Welcome to the dawn.
        </Text>
        <Text style={welcomeStyles.intro}>
          You've just accessed the beautiful experience. This experience will cover courtship, sex,
          commitment, fetishes, loneliness, vindication, love, and hate. Please enjoy your experience.
        </Text>

        {/* app logo — the PNG has transparent corners, so it sits on a white plate */}
        <View style={welcomeStyles.logoPlate}>
          <Image source={logo} style={welcomeStyles.logoImage} resizeMode="contain"/>
        </View>

        <Text style={welcomeStyles.quote}>
          "You get up, you go to work, you go home.{'\n'}
          ...It's Friday, it's payday. It's Friday, it's payday.{'\n'}
          You got an expectation of what's gonna happen in your life."
        </Text>

        <Text style={welcomeStyles.text}>
          Please log in to continue. You've just accessed the now experience.{'\n'}
          This experience is great for dancing and improving self-esteem.
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
      </ScrollView>
    </View>
  )
}

export default WelcomeNavigation;
