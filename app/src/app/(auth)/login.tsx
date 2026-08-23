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
// solved `success_token` when redirect=1 sends it to blank.html?success=1 with
// no token in the URL) and forward every payload to RN. Runs before page JS.
// Also mirrors payloads to console.log so they show up in `adb logcat` even if
// the RN-side parse misses them — essential for reverse-engineering the exact
// message shape on a real device (the emulator's WebView is too old to run the
// captcha widget at all).
const CAPTURE_JS = `(function(){
  if (window.__vkcap) return; window.__vkcap = 1;
  var send = function(tag, data){
    try { console.log('[vkcap]', tag, typeof data === 'string' ? data : JSON.stringify(data)); } catch(e){}
    try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({__cap:tag, data:data})); } catch(e){}
  };
  // 1) postMessage bridge (the widget's sendGetResultEvent channel).
  try {
    var _pm = window.postMessage.bind(window);
    window.postMessage = function(m,o,t){ send('pm', m); return _pm(m,o,t); };
  } catch(e){}
  window.addEventListener('message', function(e){ send('msg', e.data); }, true);
  // 2) THE reliable channel: the not_robot widget POSTs to
  //    api.vk.com/method/captchaNotRobot.check and the JSON response carries
  //    { response: { success_token } }. Hook fetch + XHR and forward any body
  //    that mentions success_token — findToken() on the RN side pulls it out.
  try {
    var _fetch = window.fetch;
    if (_fetch) window.fetch = function(){
      var args = arguments;
      return _fetch.apply(this, args).then(function(res){
        try {
          var url = (args[0] && args[0].url) || args[0] || '';
          if (String(url).indexOf('captchaNotRobot') !== -1) {
            res.clone().text().then(function(t){ if (t && t.indexOf('success_token') !== -1) send('xhr', t); }).catch(function(){});
          }
        } catch(e){}
        return res;
      });
    };
  } catch(e){}
  try {
    var _open = XMLHttpRequest.prototype.open, _sendX = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m,u){ this.__vku = u; return _open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function(){
      var x = this;
      x.addEventListener('load', function(){
        try {
          if (String(x.__vku || '').indexOf('captchaNotRobot') !== -1) {
            var t = x.responseText || '';
            if (t.indexOf('success_token') !== -1) send('xhr', t);
          }
        } catch(e){}
      });
      return _sendX.apply(this, arguments);
    };
  } catch(e){}
})(); true;`;

// Recursively find a captcha success token in an arbitrary message payload.
// The not_robot bridge nests its result, and sometimes ships it as a JSON string
// inside a field, so parse stringified JSON as we descend.
const findToken = (obj: any, depth = 0): string | undefined => {
  if (obj == null || depth > 8) return undefined;
  if (typeof obj === "string") {
    // A field value that is itself JSON — dig in.
    const s = obj.trim();
    if ((s.startsWith("{") || s.startsWith("[")) && s.length < 20000) {
      try {
        return findToken(JSON.parse(s), depth + 1);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const v = (obj as any)[k];
      if (typeof v === "string" && /(success_?token|captcha_?key|^token$|^key$)/i.test(k) && v.length > 6) {
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
  // Pending keyless-resume timer. When the captcha lands on blank.html?success=1
  // we do NOT resume immediately: the widget fires its `success_token` via
  // postMessage at almost the same instant, and a keyless resume just loops back
  // into the captcha (verified: a bare re-grant always returns need_captcha).
  // So we wait briefly for the token; _onMessage cancels this timer and does the
  // keyed resume if the token arrives, otherwise this fires as a last resort.
  const blankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resumeWith = (successToken?: string) => {
    if (resuming.current) return;
    resuming.current = true;
    if (blankTimer.current) {
      clearTimeout(blankTimer.current);
      blankTimer.current = null;
    }
    setBusy(true);
    const base = apiUrls.authResumeUrl;
    // not_robot is redeemed on the token endpoint with captcha_sid (held in the
    // backend session) + success_token — proven working. Pass it as success_token.
    const url = successToken
      ? `${base}${base.includes("?") ? "&" : "?"}success_token=${encodeURIComponent(successToken)}`
      : base;
    console.log("[login] -> resume", successToken ? "WITH success_token" : "keyless (fallback)");
    setUri(url);
  };

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

  // Never leak the pending keyless-resume timer if the screen unmounts mid-flow.
  useEffect(() => () => {
    if (blankTimer.current) clearTimeout(blankTimer.current);
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
    // Log the FULL raw payload (not truncated) so `adb logcat` reveals the exact
    // message shape the not_robot widget uses on a real device — we need this to
    // confirm which field carries the success_token.
    console.log("[captcha bridge]", payload.__cap, JSON.stringify(payload.data));
    const token = findToken(payload.data);
    if (token) {
      console.log("[captcha bridge] -> success_token captured, keyed resume");
      resumeWith(token);
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
    console.log("[login nav]", url);
    const hasToken = url.includes("access_token=");

    // Back on VK's captcha page — allow a fresh resume cycle AND drop the busy
    // overlay. The overlay is absolutely positioned over the WebView, so leaving
    // it up while the captcha renders looks like an endless spinner and swallows
    // every tap on the checkbox (the reported "crutilka" hang).
    if (url.includes("not_robot_captcha")) {
      resuming.current = false;
      setBusy(false);
    }

    // Terminal success — ANY redirect carrying the token (matches the original
    // lenient handler; not tied to a "blank.html" path).
    if (hasToken && !handled.current) {
      console.log("[login] -> token found, finishing");
      handled.current = true;
      parseAndFinish(url);
      return true;
    }

    // Captcha solved (blank.html?success=1, no token in URL). Do NOT resume
    // immediately — the widget's success_token arrives via postMessage at nearly
    // the same moment, and a keyless resume just loops back into the captcha.
    // Wait briefly: _onMessage will cancel this timer and do the keyed resume if
    // the token shows up; otherwise fall back to a keyless resume (e.g. the flow
    // actually advances to 2FA rather than re-challenging).
    if (url.includes("blank.html") && url.includes("success=1") && !resuming.current) {
      if (!blankTimer.current) {
        console.log("[login] -> captcha success=1, waiting 1500ms for success_token");
        blankTimer.current = setTimeout(() => {
          blankTimer.current = null;
          console.log("[login] -> no success_token arrived, keyless resume");
          resumeWith();
        }, 1500);
      }
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
