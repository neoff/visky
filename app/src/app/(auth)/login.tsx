import { useSession } from "@/components/SessionProvider";
import { apiUrls, colors } from "@/constants";
import { getAuth } from "@/helpers/network";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { WebView } from "react-native-webview";
import { WebViewNavigation } from "react-native-webview/src/WebViewTypes";

/**
 * Auth is done in a WebView pointed at the backend /auth/vk.
 *
 *  - Primary (relay OAuth): backend 302s to VK's real authorize page, so 2FA
 *    and human-check work natively. VK redirects to blank.html#access_token=...
 *    WITHOUT a secret; we POST that URL to the backend (/api/auth/token) to
 *    upgrade it to token+secret before signing in.
 *  - Fallback (hybrid direct grant): backend serves a login form that returns
 *    blank.html#...&secret=... directly; we sign in with those fragments as-is.
 *
 * We detect the final redirect by "blank.html" + "access_token=" in the URL,
 * then branch on whether a secret is already present in the hash.
 */
const LoginPage = () => {
  const { signIn } = useSession();
  const router = useRouter();

  const [uri, setUri] = useState<string>(apiUrls.authAppUrl);
  const [busy, setBusy] = useState<boolean>(false);
  const handled = useRef<boolean>(false);

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

  const _onNavigationStateChange = (event: WebViewNavigation) => {
    const url: string = event.url || "";
    const isBlank = url.includes("blank.html");
    const hasToken = url.includes("access_token=");
    if (!isBlank || !hasToken || handled.current) return;

    handled.current = true; // guard against duplicate nav events

    const hash = url.includes("#") ? url.split("#")[1] : url.split("?")[1] || "";
    const fragments: Record<string, string> = {};
    hash.split("&").forEach((pair) => {
      const [k, v] = pair.split("=");
      if (k) fragments[k] = decodeURIComponent(v ?? "");
    });

    // Fallback path already carries a secret -> sign in directly.
    if (fragments.access_token && fragments.secret) {
      finish(fragments);
      return;
    }

    // Relay-OAuth path: no secret in hash. Upgrade via backend /api/auth/token.
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
            // Could not obtain a secret (VK ID forced?) — offer the fallback.
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

  return (
    <View style={styles.container}>
      <WebView
        key={uri}
        originWhitelist={["*"]}
        source={{ uri }}
        onNavigationStateChange={_onNavigationStateChange}
        incognito // fresh cookies each attempt: avoids stale VK ID sessions
        style={styles.web}
      />

      {busy && (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.text} size="large" />
        </View>
      )}

      {uri !== apiUrls.authFallbackUrl && (
        <TouchableOpacity
          style={styles.fallbackBtn}
          onPress={() => {
            handled.current = false;
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
