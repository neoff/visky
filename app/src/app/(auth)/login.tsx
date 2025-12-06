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
  
  // Clear any old session when login page loads
  React.useEffect(() => {
    console.log("===Login: Clearing old session");
    signOut();
  }, []);

  const _onNavigationStateChange = (event: WebViewNavigation) => {
    console.log("===Navigation changed:", event.url, "loading:", event.loading, "canGoBack:", event.canGoBack, "title:", event.title)
    const redirectUrl: string = event.url;
    
    // Check if we got redirected to blank.html with hash
    if (redirectUrl.includes('blank.html') && redirectUrl.includes('#')) {
      const hash = redirectUrl.split('#')[1];
      const params = new URLSearchParams(hash);
      
      const accessToken = params.get('access_token');
      const userId = params.get('user_id');
      const expiresIn = params.get('expires_in');
      
      console.log("===Auth response:", {userId: userId?.substring(0, 5), hasToken: !!accessToken, expiresIn});
      
      if (accessToken && userId) {
        // VK OAuth doesn't return 'secret' in standard flow, generate it from access_token
        const secret = accessToken.split('.').pop() || '';
        
        // Save session with all required parameters
        signIn({
          user_id: userId, 
          access_token: accessToken,
          secret: secret,
          auth_url: redirectUrl
        });
        router.replace('/(app)/(tabs)/(songs)');
        return;
      } else {
        console.error("===Auth failed:", redirectUrl);
        alert("Authorization failed. Please try again.");
        return;
      }
    }
  }
  
  const _onMessage = (event: any) => {
    // Handle messages from injected JS
    const message = event.nativeEvent.data;
    console.log("===WebView message:", message);
    
    // Check if message contains auth data
    if (message.includes('access_token=')) {
      const params = new URLSearchParams(message);
      const accessToken = params.get('access_token');
      const userId = params.get('user_id');
      
      if (accessToken && userId) {
        const secret = accessToken.split('.').pop() || '';
        console.log("===Auth success via message:", {userId: userId.substring(0, 5)});
        signIn({
          user_id: userId,
          access_token: accessToken,
          secret: secret,
          auth_url: `blank.html#${message}`
        });
        router.replace('/(app)/(tabs)/(songs)');
      }
    }
  }
  
  // Inject JS to detect hash changes
  const injectedJS = `
    (function() {
      // Replace address bar URL to show oauth.vk.com instead of visky.envarg.com
      if (window.location.href.includes('visky.envarg.com')) {
        const newUrl = 'https://oauth.vk.com/authorize';
        try {
          window.history.replaceState({}, document.title, newUrl);
        } catch(e) {
          console.log('Cannot replace history state:', e);
        }
      }
      
      // Debug: send page info
      setTimeout(function() {
        const info = {
          url: window.location.href,
          title: document.title,
          readyState: document.readyState,
          bodyHTML: document.body ? document.body.innerHTML.substring(0, 200) : 'NO BODY',
          hasScript: document.scripts.length,
          hasStylesheet: document.styleSheets.length
        };
        window.ReactNativeWebView.postMessage('DEBUG: ' + JSON.stringify(info));
      }, 1000);
      
      function checkAuth() {
        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
          window.ReactNativeWebView.postMessage(hash.substring(1));
          return true;
        }
        return false;
      }
      
      // Check immediately
      if (checkAuth()) return;
      
      // Watch for hash changes
      let lastHash = window.location.hash;
      setInterval(function() {
        if (window.location.hash !== lastHash) {
          lastHash = window.location.hash;
          if (checkAuth()) return;
        }
      }, 100);
    })();
    true;
  `;
  
  console.info("===LoginPage", apiUrls.authAppUrl);
  console.log('baseHost:', apiUrls.baseUrl, apiUrls.authAppUrl, __DEV, Platform.OS)
  
  return (
    <View style={{flex: 1}}>
      <WebView
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptCanOpenWindowsAutomatically={true}
        incognito={true}
        cacheEnabled={false}
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        originWhitelist={['*']}
        source={{
          uri: apiUrls.authAppUrl,
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
          }
        }}
        onNavigationStateChange={_onNavigationStateChange}
        onMessage={_onMessage}
        injectedJavaScript={injectedJS}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('===WebView error:', JSON.stringify(nativeEvent, null, 2));
          alert(`WebView Error: ${nativeEvent.description || nativeEvent.code}`);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('===WebView HTTP error:', nativeEvent.statusCode, nativeEvent.url, nativeEvent.description);
          alert(`HTTP Error ${nativeEvent.statusCode}: ${nativeEvent.url}`);
        }}
        onLoadStart={() => console.log('===WebView load started')}
        onLoadEnd={() => console.log('===WebView load ended')}
        style={{marginTop: 20}}
      />
    </View>
  )
}
export default LoginPage