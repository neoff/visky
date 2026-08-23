import { useSession } from "@/components/SessionProvider";
import { apiUrls, colors } from "@/constants";
import { getAuth } from "@/helpers/network";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { WebView } from "react-native-webview";
import { WebViewNavigation } from "react-native-webview/src/WebViewTypes";

/**
 * Auth runs in a WebView pointed at the backend /auth/vk (real VK login page).
 * The backend drives the direct password grant (the only path yielding an
 * audio-capable token+secret). Two things this screen handles:
 *
 *  1. Success: backend redirects to blank.html#access_token=..&secret=..&device_id=..
 *     -> we sign in with those fragments.
 *  2. Captcha (VK "not_robot"): backend 302s the WebView to VK's real captcha.
 *     The widget delivers its result (`success_token`) ONLY via a bridge
 *     postMessage (never in the URL), so `injectedJavaScriptBeforeContentLoaded`
 *     wraps window.postMessage to forward every message to RN. When we see the
 *     success_token we retry the grant via /auth/vk/resume?captcha_key=<token>.
 *
 * device_id: a stable, real id is generated once and kept in SecureStore, then
 * passed to the backend (?device_id=). One consistent device looks far less like
 * abuse to VK than a fresh random id per attempt (which escalates to captcha).
 */

const DEVICE_KEY = "vk_device_id";
const genDeviceId = (): string => {
  const a = "abcdefghijklmnopqrstuvwxyz0987654321";
  let r = "";
  for (let i = 0; i < 16; i++) r += a[Math.floor(Math.random() * a.length)];
  return r;
};

// Intercept the captcha widget's bridge postMessage (its only channel for the
// solved `success_token`) and forward every payload to RN. Runs before page JS.
const CAPTURE_JS = `(function(){
  if (window.__vkcap) return; window.__vkcap = 1;
  var send = function(tag, data){
    try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({__cap:tag, data:data})); } catch(e){}
  };
  try {
    var _pm = window.postMessage.bind(window);
    window.postMessage = function(m,o,t){ send('pm', m); return _pm(m,o,t); };
  } catch(e){}
  window.addEventListener('message', function(e){ send('msg', e.data); }, true);
})(); true;`;

// Recursively find a captcha success token in an arbitrary message payload.
const findToken = (obj: any, depth = 0): string | undefined => {
  if (!obj || depth > 6) return undefined;
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const v = (obj as any)[k];
      if (typeof v === "string" && /^(success_?token|token|captcha_?key|key)$/i.test(k) && v.length > 6) {
        return v;
      }
    }
    for (const k of Object.keys(obj)) {
      const found = findToken((obj as any)[k], depth + 1);
      if (found) return found;
    }
  }
  return undefined;
};

const LoginPage = () => {
  const { signIn } = useSession();
  const router = useRouter();

  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const handled = useRef<boolean>(false);
  const resuming = useRef<boolean>(false);

  // Resolve a stable device_id, then point the WebView at the backend with it.
  // Guarded by a timeout so a slow/hanging SecureStore never leaves the WebView
  // unmounted — device_id is only an optimization (backend generates one if
  // absent), it must never block login.
  useEffect(() => {
    let set = false;
    const point = (d: string) => {
      if (set) return;
      set = true;
      const sep = apiUrls.authAppUrl.includes("?") ? "&" : "?";
      setUri(`${apiUrls.authAppUrl}${sep}device_id=${d}`);
    };
    const fallback = setTimeout(() => point(genDeviceId()), 700);
    (async () => {
      try {
        let d = await SecureStore.getItemAsync(DEVICE_KEY);
        if (!d) {
          d = genDeviceId();
          await SecureStore.setItemAsync(DEVICE_KEY, d);
        }
        clearTimeout(fallback);
        point(d);
      } catch {
        clearTimeout(fallback);
        point(genDeviceId());
      }
    })();
    return () => clearTimeout(fallback);
  }, []);

  const finish = (fragments: Record<string, string>) => {
    signIn({
      user_id: fragments.user_id ?? null,
      access_token: fragments.access_token,
      secret: fragments.secret,
      device_id: fragments.device_id,
      auth_url: null,
    });
    router.dismiss();
  };

  // Captcha result carrier: forward captured success_token to the resume grant.
  const _onMessage = (event: { nativeEvent: { data: string } }) => {
    let payload: any;
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (!payload || !payload.__cap) return;
    console.log("[captcha bridge]", JSON.stringify(payload.data).slice(0, 300));
    const token = findToken(payload.data);
    if (token && !resuming.current) {
      resuming.current = true;
      setBusy(true);
      const sep = apiUrls.authResumeUrl.includes("?") ? "&" : "?";
      setUri(`${apiUrls.authResumeUrl}${sep}captcha_key=${encodeURIComponent(token)}`);
    }
  };

  // Parse the final blank.html#access_token&secret&... and sign in (or upgrade
  // via /token if the hash has no secret).
  const parseAndFinish = (url: string) => {
    const hash = url.includes("#") ? url.split("#")[1] : url.split("?")[1] || "";
    const fragments: Record<string, string> = {};
    hash.split("&").forEach((pair) => {
      const [k, v] = pair.split("=");
      if (k) fragments[k] = decodeURIComponent(v ?? "");
    });

    if (fragments.access_token && fragments.secret) {
      finish(fragments);
      return;
    }

    setBusy(true);
    getAuth(
      {
        onLoad: (data: any) => {
          setBusy(false);
          if (data?.access_token && data?.secret) {
            finish({
              user_id: data.user_id,
              access_token: data.access_token,
              secret: data.secret,
              device_id: data.device_id,
            });
          } else {
            handled.current = false;
            setUri(apiUrls.authFallbackUrl);
          }
        },
        onError: () => {
          setBusy(false);
          handled.current = false;
          setUri(apiUrls.authFallbackUrl);
        },
      },
      url
    );
  };

  // Single URL interception, shared by onShouldStartLoadWithRequest (reliable on
  // iOS incl. redirects) and onNavigationStateChange (fires on Android redirects).
  // Returns true when the URL was a terminal redirect we consumed.
  const processUrl = (url: string): boolean => {
    if (!url) return false;
    const hasToken = url.includes("access_token=");

    // Back on VK's captcha page — allow a fresh resume cycle.
    if (url.includes("not_robot_captcha")) resuming.current = false;

    // Terminal success — ANY redirect carrying the token (matches the original
    // lenient handler; not tied to a "blank.html" path).
    if (hasToken && !handled.current) {
      handled.current = true;
      parseAndFinish(url);
      return true;
    }

    // Captcha solved but no success_token captured via the bridge — keyless
    // resume (best effort).
    if (url.includes("blank.html") && url.includes("success=1") && !resuming.current) {
      resuming.current = true;
      setBusy(true);
      setUri(apiUrls.authResumeUrl);
      return true;
    }
    return false;
  };

  const _onShouldStart = (req: { url: string }): boolean => !processUrl(req.url || "");
  const _onNavigationStateChange = (event: WebViewNavigation) => {
    processUrl(event.url || "");
  };

  return (
    <View style={styles.container}>
      {uri && (
        <WebView
          originWhitelist={["*"]}
          source={{ uri }}
          injectedJavaScriptBeforeContentLoaded={CAPTURE_JS}
          onMessage={_onMessage}
          onShouldStartLoadWithRequest={_onShouldStart}
          onNavigationStateChange={_onNavigationStateChange}
          incognito // fresh cookies each attempt: avoids stale VK ID sessions
          style={styles.web}
        />
      )}

      {(busy || !uri) && (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.text} size="large" />
        </View>
      )}

      {uri && uri.indexOf(apiUrls.authFallbackUrl) !== 0 && (
        <TouchableOpacity
          style={styles.fallbackBtn}
          onPress={() => {
            handled.current = false;
            resuming.current = false;
            setUri(apiUrls.authFallbackUrl);
          }}
        >
          <Text style={styles.fallbackText}>Проблемы со входом? Войти через форму</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  web: { flex: 1, marginTop: 20 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackBtn: { paddingVertical: 14, alignItems: "center", backgroundColor: colors.background },
  fallbackText: { color: colors.textMuted, fontSize: 13 },
});

export default LoginPage;
