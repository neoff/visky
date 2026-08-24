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
  // 0) VK's not_robot bundle uses ES2022 syntax (class static blocks). WebViews
  //    older than Chromium 94 throw "SyntaxError: Unexpected token '{'" while
  //    parsing it, so the widget never mounts and the page stays blank. Detect
  //    that up front and tell RN, so we can show a real explanation instead of
  //    an empty screen (Samsung Android 9 ships ~Chromium 66; API-31 emu ~91).
  try {
    // No regex here on purpose: this whole script lives in a TS template
    // literal, where a backslash-d escape collapses to a plain 'd' and quietly
    // corrupts the pattern
    // (it produced a SyntaxError that killed the entire injection, including
    // the success_token hooks below).
    var ua = navigator.userAgent || '';
    var i = ua.indexOf('Chrome/');
    var major = i === -1 ? 0 : parseInt(ua.substring(i + 7), 10) || 0;
    if (location.href.indexOf('not_robot_captcha') !== -1 && major && major < 94) {
      send('oldwv', {chrome: major});
    }
  } catch(e){}
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
  //    A response WITHOUT success_token is just as informative: check answers
  //    {status:"BOT", show_captcha_type:"slider"|undefined} when VK refuses the
  //    checkbox, and the widget then silently swaps to a slider puzzle (or, with
  //    no show_captcha_type, goes to its "blocked" state). Both look like a hang
  //    from outside, so forward EVERY captchaNotRobot.* body under tag 'chk' and
  //    let the RN side decode which branch fired.
  var report = function(url, body){
    if (!body) return;
    var m = String(url).split('captchaNotRobot.')[1] || '';
    m = m.split('?')[0];
    if (body.indexOf('success_token') !== -1) send('xhr', body);
    else send('chk', {m: m, body: body.slice(0, 400)});
  };
  try {
    var _fetch = window.fetch;
    if (_fetch) window.fetch = function(){
      var args = arguments;
      return _fetch.apply(this, args).then(function(res){
        try {
          var url = (args[0] && args[0].url) || args[0] || '';
          if (String(url).indexOf('captchaNotRobot') !== -1) {
            res.clone().text().then(function(t){ report(url, t); }).catch(function(){});
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
          if (String(x.__vku || '').indexOf('captchaNotRobot') !== -1) report(x.__vku, x.responseText || '');
        } catch(e){}
      });
      return _sendX.apply(this, arguments);
    };
  } catch(e){}
  // 3) THE GRANT ITSELF. The backend 302s us to oauth.vk.com/token instead of
  //    calling VK server-side: the cluster's egress IP is flagged and gets
  //    need_captcha on every single attempt, while the same request from a
  //    phone's IP returns the token outright. VK answers with a JSON body that
  //    the WebView renders as text — read it once and hand it to RN, which posts
  //    it back to /auth/vk/next so the backend decides the next step.
  var grabbed = 0;
  var grabGrant = function(){
    try {
      if (grabbed) return;
      if (location.host.indexOf('oauth.vk.com') === -1) return;
      if (location.pathname.indexOf('/token') !== 0) return;
      var b = document.body;
      var t = ((b && (b.innerText || b.textContent)) || '').trim();
      if (t.charAt(0) !== '{') return;
      grabbed = 1;
      send('grant', t);
    } catch(e){}
  };
  document.addEventListener('DOMContentLoaded', grabGrant);
  window.addEventListener('load', grabGrant);
  // 4) Uncaught page errors. The widget swallows most failures into a silent
  //    state change, but a broken bundle / missing API surfaces here and is the
  //    difference between "VK said no" and "our WebView cannot run the widget".
  window.addEventListener('error', function(e){
    try { send('err', {m: (e && e.message) || '', src: (e && e.filename) || ''}); } catch(x){}
  }, true);
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
  // One grant response per attempt. Separate from `handled` (which guards the
  // final sign-in) because forwarding the grant JSON is a mid-flow step: the
  // backend answers it with the token redirect, which `handled` must still
  // accept.
  const grantSent = useRef<boolean>(false);
  // Pending keyless-resume timer. When the captcha lands on blank.html?success=1
  // we do NOT resume immediately: the widget fires its `success_token` via
  // postMessage at almost the same instant, and a keyless resume just loops back
  // into the captcha (verified: a bare re-grant always returns need_captcha).
  // So we wait briefly for the token; _onMessage cancels this timer and does the
  // keyed resume if the token arrives, otherwise this fires as a last resort.
  const blankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chromium major version of the WebView, reported from the captcha page when
  // it is too old to run VK's widget (<94). Drives the explanation banner.
  const [oldWebView, setOldWebView] = useState<number | null>(null);
  // Last non-OK status from captchaNotRobot.check ("BOT", "BOT:slider",
  // "ERROR_LIMIT", ...). Drives the explanation shown over the dead widget.
  const [captchaError, setCaptchaError] = useState<string | null>(null);

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
    // Diagnostics for the "widget hangs after the checkbox" report: VK answers
    // captchaNotRobot.check with a status, and every non-OK status leaves the
    // widget sitting there with no navigation and no token.
    //   status "OK"                          -> success_token (handled below)
    //   status "BOT" + show_captcha_type      -> silently swaps to that puzzle
    //   status "BOT" without show_captcha_type-> internal "blocked" state
    //   ERROR_LIMIT / ERROR_TOKEN_EXPIRED / ERROR -> dead ends
    if (payload.__cap === "chk") {
      const m = payload.data?.m;
      const body = String(payload.data?.body ?? "");
      console.log("[captcha api]", m, body);
      if (m === "check") {
        const status = /"status"\s*:\s*"([A-Z_]+)"/.exec(body)?.[1];
        const next = /"show_captcha_type"\s*:\s*"([a-z]+)"/.exec(body)?.[1];
        console.log("[captcha api] check status:", status, "next:", next ?? "none");
        if (status && status !== "OK") setCaptchaError(next ? `${status}:${next}` : status);
      }
      return;
    }
    // VK's grant JSON, read off the token page the WebView loaded itself.
    if (payload.__cap === "grant") {
      const raw = String(payload.data ?? "");
      console.log("[login] grant response from device, len", raw.length);
      if (!grantSent.current) {
        grantSent.current = true;
        const base = apiUrls.authNextUrl;
        setBusy(true);
        setUri(`${base}${base.includes("?") ? "&" : "?"}d=${encodeURIComponent(raw)}`);
      }
      return;
    }
    if (payload.__cap === "err") {
      console.log("[captcha page error]", payload.data?.m, payload.data?.src);
      return;
    }
    if (payload.__cap === "oldwv") {
      const v = payload.data?.chrome;
      console.log("[login] WebView too old for VK captcha: Chromium", v);
      setBusy(false);
      setOldWebView(typeof v === "number" ? v : 0);
      return;
    }
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
    // The grant page briefly renders VK's raw JSON (token included). Keep the
    // overlay up over it until grabGrant has handed it back to /auth/vk/next.
    if (url.includes("oauth.vk.com/token")) {
      setBusy(true);
      return false;
    }

    // A backend step rendered (login form, 2FA, error) — the flow continues, so
    // allow the next grant response to be consumed.
    if (url.includes("/auth/vk") && !url.includes("/auth/vk/next")) {
      grantSent.current = false;
      setBusy(false);
    }

    if (url.includes("not_robot_captcha")) {
      resuming.current = false;
      setBusy(false);
      setCaptchaError(null);
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

      {(busy || !uri) && !oldWebView && (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.text} size="large" />
        </View>
      )}

      {/* VK's captcha widget needs Chromium >= 94. On older WebViews its bundle
          throws a SyntaxError and the page just stays blank, which looks like a
          hang — say what is actually wrong and how to fix it. */}
      {oldWebView !== null && (
        <View style={styles.overlay}>
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Нужно обновить WebView</Text>
            <Text style={styles.noticeText}>
              Проверка VK «я не робот» не запускается: системный компонент
              Android System WebView устарел
              {oldWebView ? ` (Chromium ${oldWebView})` : ""}, нужен 94 или новее.
              {"\n\n"}
              Откройте Google Play, обновите «Android System WebView» (и Chrome),
              затем войдите снова.
            </Text>
          </View>
        </View>
      )}

      {/* VK answered the checkbox with a non-OK status. "BOT:<type>" means it
          swapped in another puzzle (still solvable — just hint, never cover it);
          anything else is a dead end where the widget stops reacting entirely. */}
      {captchaError !== null &&
        (captchaError.startsWith("BOT:") ? (
          <View style={styles.hintBar} pointerEvents="none">
            <Text style={styles.hintText}>
              VK просит дополнительную проверку — решите задание выше
            </Text>
          </View>
        ) : (
          <View style={styles.overlay}>
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>VK не принял проверку</Text>
              <Text style={styles.noticeText}>
                {captchaError === "ERROR_LIMIT"
                  ? "Слишком много попыток проверки. Подождите несколько минут и попробуйте снова."
                  : captchaError === "ERROR_TOKEN_EXPIRED"
                    ? "Проверка устарела — начните вход заново."
                    : "VK отклонил проверку «я не робот» и больше не реагирует. Начните вход заново."}
                {"\n\n"}
                Код ответа: {captchaError}
              </Text>
              <TouchableOpacity
                style={styles.noticeBtn}
                onPress={() => {
                  handled.current = false;
                  resuming.current = false;
                  grantSent.current = false;
                  setCaptchaError(null);
                  setUri(apiUrls.authAppUrl);
                }}
              >
                <Text style={styles.noticeBtnText}>Начать заново</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

      {uri && uri.indexOf(apiUrls.authFallbackUrl) !== 0 && (
        <TouchableOpacity
          style={styles.fallbackBtn}
          onPress={() => {
            handled.current = false;
            resuming.current = false;
            grantSent.current = false;
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
  notice: { margin: 24, padding: 20, borderRadius: 12, backgroundColor: "#1c1c1e" },
  noticeBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#3f8ae0",
  },
  noticeBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  hintBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  hintText: { color: colors.text, fontSize: 13, textAlign: "center" },
  noticeTitle: { color: colors.text, fontSize: 17, fontWeight: "600", marginBottom: 10 },
  noticeText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  fallbackBtn: { paddingVertical: 14, alignItems: "center", backgroundColor: colors.background },
  fallbackText: { color: colors.textMuted, fontSize: 13 },
});

export default LoginPage;
