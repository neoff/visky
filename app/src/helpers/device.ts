import * as SecureStore from "expo-secure-store";
import {Platform} from "react-native";

/**
 * This installation's identity.
 *
 * The same id does double duty: VK's `device_id` (it is part of the signed
 * audio request, so it has to stay put) and the playback device id the Connect
 * feature addresses a transfer to. Keeping one id for both means nothing new
 * has to be provisioned to make a phone a transfer target.
 *
 * It lives in SecureStore, which survives app updates (keychain on iOS, the
 * keystore-backed store on Android) — only a reinstall mints a new one.
 *
 * Sessions created before this existed have no `device_id` at all: those are
 * backfilled on the next launch (see SessionProvider) instead of being asked to
 * log in again.
 */
export const DEVICE_KEY = "vk_device_id";

/** Same alphabet and length the backend's `deviceIDgen` uses. */
export const genDeviceId = (): string => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0987654321";
  let result = "";
  for (let i = 0; i < 16; i++) result += alphabet[Math.floor(Math.random() * alphabet.length)];
  return result;
};

const readStored = async (): Promise<string | null> => {
  if (Platform.OS === "web") {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(DEVICE_KEY);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(DEVICE_KEY);
};

const writeStored = async (value: string): Promise<void> => {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(DEVICE_KEY, value);
    } catch {
      /* private mode: the id stays for this session only */
    }
    return;
  }
  await SecureStore.setItemAsync(DEVICE_KEY, value);
};

/** In-flight/settled result, so parallel callers cannot mint two different ids. */
let pending: Promise<string> | null = null;

/**
 * The device id, minting and persisting one on first use.
 *
 * Never rejects: a storage failure falls back to a fresh id for this run rather
 * than blocking login or playback.
 */
export const ensureDeviceId = (): Promise<string> => {
  if (!pending) {
    pending = (async () => {
      try {
        const stored = await readStored();
        if (stored) return stored;
        const minted = genDeviceId();
        await writeStored(minted);
        console.log("==device: minted a device id");
        return minted;
      } catch (error) {
        console.warn("==device: storage unavailable, using a volatile id", error);
        return genDeviceId();
      }
    })();
  }
  return pending;
};

/** Tests / sign-out: forget the memoised value (the stored one stays). */
export const __resetDeviceIdCache = (): void => {
  pending = null;
};

/**
 * What this installation calls itself in the device picker.
 *
 * `Constants.deviceName` is a native-only value: on web it is undefined, which
 * left the desktop player listed as the unhelpful "web device". The Electron
 * shell exposes `window.viskyDesktop`, so a real desktop can name itself; a
 * plain browser tab stays generic.
 */
export const deviceLabel = (): string => {
  if (Platform.OS !== "web") return `${Platform.OS} device`;
  const desktop =
    typeof window !== "undefined" &&
    (window as unknown as {viskyDesktop?: {platform?: string}}).viskyDesktop;
  if (desktop) return desktop.platform === "macos" ? "Mac" : "Desktop";
  return "Browser";
};
