import { useSession } from "@/components/SessionProvider";
import { colors, fonts } from "@/constants";
import { directAuth } from "@/helpers/network";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Challenge =
  | { kind: "none" }
  | { kind: "2fa"; validation_type?: string; phone_mask?: string; device_id?: string }
  | { kind: "captcha"; captcha_sid: string; captcha_img: string; device_id?: string };

const LoginPage = () => {
  const { signIn } = useSession();
  const router = useRouter();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [captchaKey, setCaptchaKey] = useState("");
  const [challenge, setChallenge] = useState<Challenge>({ kind: "none" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!login || !password) {
      setError("Enter login and password");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: any = { login, password };
      if (challenge.kind === "2fa") {
        payload.code = code;
        payload.device_id = challenge.device_id;
      }
      if (challenge.kind === "captcha") {
        payload.captcha_sid = challenge.captcha_sid;
        payload.captcha_key = captchaKey;
        payload.device_id = challenge.device_id;
      }

      const data = await directAuth(payload);

      if (data?.error === "need_validation") {
        setChallenge({
          kind: "2fa",
          validation_type: data.validation_type,
          phone_mask: data.phone_mask,
          device_id: data.device_id,
        });
        setError(null);
        return;
      }
      if (data?.error === "need_captcha") {
        setChallenge({
          kind: "captcha",
          captcha_sid: data.captcha_sid,
          captcha_img: data.captcha_img,
          device_id: data.device_id,
        });
        setCaptchaKey("");
        setError(null);
        return;
      }

      if (data?.access_token && data?.secret && data?.user_id) {
        signIn({
          user_id: data.user_id,
          access_token: data.access_token,
          secret: data.secret,
          device_id: data.device_id,
          auth_url: null,
        });
        router.dismiss();
        return;
      }

      setError("Unexpected response from server");
    } catch (e: any) {
      const msg =
        e?.response?.data?.errMessage ||
        e?.message ||
        "Authentication failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.form}>
        <Text style={styles.title}>Sign in to VK</Text>

        <TextInput
          style={styles.input}
          placeholder="Phone or email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={login}
          onChangeText={setLogin}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />

        {challenge.kind === "2fa" && (
          <>
            <Text style={styles.hint}>
              {challenge.phone_mask
                ? `Code sent to ${challenge.phone_mask}`
                : "Enter the 2FA code"}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="2FA code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
              editable={!loading}
            />
          </>
        )}

        {challenge.kind === "captcha" && (
          <>
            <Text style={styles.hint}>Enter the captcha</Text>
            <Image
              source={{ uri: challenge.captcha_img }}
              style={styles.captcha}
              resizeMode="contain"
            />
            <TextInput
              style={styles.input}
              placeholder="Captcha"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              value={captchaKey}
              onChangeText={setCaptchaKey}
              editable={!loading}
            />
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={submit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>
              {challenge.kind === "none" ? "Sign in" : "Confirm"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
  },
  form: {
    paddingHorizontal: 24,
    gap: 14,
  },
  title: {
    color: colors.text,
    fontSize: fonts.lg,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: fonts.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fonts.xs,
  },
  captcha: {
    width: "100%",
    height: 70,
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  error: {
    color: colors.primary,
    fontSize: fonts.xs,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text,
    fontSize: fonts.sm,
    fontWeight: "600",
  },
});

export default LoginPage;
