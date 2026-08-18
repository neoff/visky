import { useSession } from "@/components/SessionProvider";
import { __DEV, apiUrls } from "@/constants";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";
import { WebViewNavigation } from "react-native-webview/src/WebViewTypes";


const LoginPage = () => {
  console.log("===Login");
  const {signIn, signOut} = useSession();
  const router = useRouter();

  const _onNavigationStateChange = (event: WebViewNavigation) => {
    //console.log("===New url:", event.url)
    const redirectUrl: string = event.url;
    const sharp: boolean = redirectUrl.includes("#") || false
    const token: boolean = redirectUrl.includes("access_token=") || false
    const secret: boolean = redirectUrl.includes("secret=") || false
    if (!sharp && !token && !secret) {
      return;
    }
    if(sharp && (!token || !secret)){
      console.error("redirect url:", redirectUrl);
      alert("Wrong auth url, no 'token' or 'secret'")
      throw new Error("Wrong auth url, no 'token' or 'secret'");
    }
    signIn({user_id: null, auth_url: redirectUrl});
    router.dismiss()
  }
  console.info("===LoginPage", apiUrls.authAppUrl);
  let urls  = apiUrls.authAppUrl
  console.log('baseHost:', apiUrls.baseUrl, urls, __DEV, Platform.OS)
  return (
    <View style={{flex: 1}}>
      <WebView
        originWhitelist={['*']}
        source={{uri: apiUrls.authAppUrl}}
        //source={{html: html}}
        onNavigationStateChange={_onNavigationStateChange}
        //injectedJavaScript={_jsCode}
        injectedJavaScript="window.postMessage(document.title)"
        //ref={(webView) => webView}
        style={{marginTop: 20}}
      />
    </View>
  )
}
export default LoginPage