import { useSession } from "@/components/SessionProvider";
import { getAuth } from "@/helpers/network";
import { AuthFragments } from "@/types/auth";
import { Redirect, Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import { Button } from "react-native";
import {apiUrls} from "@/constants";

const AuthLayout = () => {
  const { signIn, signOut, getSession, auth_url, isLoading } = useSession();
  const [authorized, setAuthorized] = useState<AuthFragments|boolean>(false);
  const router = useRouter();
  const userSession: AuthFragments = getSession() as AuthFragments;
  if (isLoading) {
    console.log("--AuthLayout=Loading...");
    return null;
  }
  console.log(`"===AuthLayout, session: ${userSession}, authorized: ${authorized}, auth_url: ${auth_url!=null} ||| auth_url=${auth_url}`);
  // On auth screen check if user already authenticated
  if (userSession?.access_token && userSession?.user_id) {
    console.log("===Auth layout : Redirecting to app, session exists", {userId: userSession?.user_id});
    return <Redirect href="/(app)/(tabs)/(songs)" />;
  }

  const getAnswer = (fragments: AuthFragments) => {
    setAuthorized(true)
    //signOut();
    console.warn("=======LOADED getAnswer=========", fragments)
    if (fragments?.access_token && fragments?.user_id) {
      //signIn({session:fragments, auth_url: null});
      signIn(fragments);
    }
    return //router.replace("/");//<Redirect href="/"/>;
  };
  if(!authorized && auth_url){
    getAuth({
      onLoad: getAnswer,
    }, auth_url);
  }

  const handleDismiss = () => {
    router.dismiss()
  };
  const titleUrl = apiUrls.baseUrl

  return (
    <Stack>
      <Stack.Screen name="welcome" options={{headerShown: false}}/>
      <Stack.Screen
        name="login"
        options={{
          presentation: 'modal',
          title: titleUrl,
          headerLeft: () => <Button onPress={handleDismiss} title="Close" />,
        }}
      />
    </Stack>)
}

export default AuthLayout