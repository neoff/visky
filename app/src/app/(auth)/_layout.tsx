import {Redirect, Stack, useRouter} from "expo-router";
import React, {useState} from "react";
import {Button} from "react-native";
import {getAuth} from "@/helpers/network";
import {AuthFragments, useSession} from "@/components/SessionProvider";

const AuthLayout = () => {
  const { signIn, signOut, getSession, auth_url, isLoading } = useSession();
  const [authorized, setAuthorized] = useState<AuthFragments|boolean>(false);
  const router = useRouter();
  const userSession = getSession();
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
    if(fragments.session) {
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

  return (
    <Stack>
      <Stack.Screen name="welcome" options={{headerShown: false}}/>
      <Stack.Screen
        name="login"
        options={{
          presentation: 'modal',
          headerLeft: () => <Button onPress={handleDismiss} title="Close" />,
        }}
      />
    </Stack>)
}

export default AuthLayout