import { useSession } from "@/components/SessionProvider";
import { useIncomingAuthLink } from "@/hooks/useIncomingAuthLink";
import { getAuth } from "@/helpers/network";
import { AuthFragments } from "@/types/auth";
import { Redirect, Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import { Button } from "react-native";
import {apiUrls, colors} from "@/constants";

const AuthLayout = () => {
  const { signIn, signOut, getSession, auth_url, isLoading } = useSession();
  const [authorized, setAuthorized] = useState<AuthFragments|boolean>(false);
  const router = useRouter();
  // A link opened with credentials in its fragment signs in before anything is
  // drawn. Sits here rather than in the root layout because this group is the
  // only one a signed-out session ever renders.
  useIncomingAuthLink();
  const userSession: AuthFragments = getSession() as AuthFragments;
  if (isLoading) {
    console.log("--AuthLayout=Loading...");
    return null;
  }
  console.log(`"===AuthLayout, session: ${userSession}, authorized: ${authorized}, auth_url: ${auth_url!=null} ||| auth_url=${auth_url}`);
  if (userSession?.access_token && userSession?.secret && userSession?.user_id) {
    console.log("---AuthLayout has token: ", userSession);
    //const router = useRouter();
    //router.replace("/");
    return <Redirect href="/"/>;
  }

  const getAnswer = (fragments: AuthFragments) => {
    setAuthorized(true)
    //signOut();
    console.warn("=======LOADED getAnswer=========", fragments)
    if (fragments?.access_token && fragments?.secret && fragments?.user_id) {
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
        name="pair"
        options={{
          title: 'Pair a device',
          // The stack's default header is light; every other screen in this app
          // is black, and a white bar over the pairing screen looks like a
          // different application.
          headerStyle: {backgroundColor: colors.background},
          headerTintColor: colors.text,
        }}
      />
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