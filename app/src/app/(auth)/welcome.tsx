import { useSession } from "@/components/SessionProvider";
import { apiUrls, fonts, modifiers, size } from "@/constants";
import { defaultStyles, iconStyles, welcomeStyles } from "@/styles";
import { Link, SplashScreen, useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View, Alert } from "react-native";
import Icon from "react-native-vector-icons/FontAwesome";
import { storage } from "@/store/library";

const WelcomeNavigation = () => {
  console.log("===WelcomeNavigation");
  const {signIn, signOut} = useSession();
  const router = useRouter();
  
  SplashScreen.hideAsync()
  
  const clearAllData = () => {
    Alert.alert(
      "Clear all app data",
      "This will delete all stored data including session and tracks. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear", 
          style: "destructive",
          onPress: async () => {
            // Clear session
            signOut();
            // Clear MMKV storage
            await storage.clearStore();
            console.log("===All app data cleared");
            Alert.alert("Success", "All app data has been cleared");
          }
        }
      ]
    );
  };
  
  return (
    <View style={welcomeStyles.container}>
      {/* Debug: Clear all data button in top right */}
      <TouchableOpacity 
        onPress={clearAllData}
        style={welcomeStyles.clearButton}>
        <Icon name="trash-o" size={20} color="#fff" />
      </TouchableOpacity>
      
      <View style={welcomeStyles.content}>
        <Text style={welcomeStyles.header}>
          Welcome to Visky
        </Text>
        <View style={welcomeStyles.avatar}>
          <Icon name="music" size={100 + size.image} color="rgba(255,255,255,.09)"/>
        </View>
        <Text style={welcomeStyles.text}>
          Login with your VK account
        </Text>
        
        <Link href={"/(auth)/login"} asChild>
          <TouchableOpacity style={welcomeStyles.button}>
            <Text style={welcomeStyles.buttonText}>
              Login with VK
            </Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  )
}

export default WelcomeNavigation;
