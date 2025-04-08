import {defaultStyles, iconStyles, welcomeStyles} from "@/styles"
import {Image, Text, View} from "react-native"
import React from "react";
import Icon from "react-native-vector-icons/FontAwesome";
import {router} from "expo-router";
import {useSession} from "@/components/SessionProvider";
import {apiUrls} from "@/constants";


const SettingsScreen = (
  state: {
    user: {
      name: string;
      username: string;
      avatar: string
    } | undefined
  }
) => {
  const {signOut} = useSession();
  const check = () => {
    signOut();
    router.replace('/');
  }
  return (
    <View style={welcomeStyles.container}>
      <View style={welcomeStyles.content}>
        <Text style={welcomeStyles.header}>
          Welcome, {state.user?.name}!{'\n\n'}or should we call{'\n'}you {state.user?.username}?
        </Text>
        <Icon.Button
          name="sign-out"
          backgroundColor="rgba(255,255,255,.09)"
          onPress={check}
          {...iconStyles} >
          Logout
        </Icon.Button>
        <View style={welcomeStyles.avatar}>
          <Image source={{uri: state.user?.avatar}} style={welcomeStyles.avatarImage}/>
        </View>

        <Text style={welcomeStyles.text}>

          App url, {apiUrls.baseUrl}
        </Text>
      </View>
    </View>
  )
}
export default SettingsScreen