import { useStorageState } from "@/hooks/useStorageState";
import { ensureDeviceId } from "@/helpers/device";
import { setAuthHeaders } from "@/helpers/network";
import { onSessionRevoked, resetRevocation } from "@/services/revocation";
import { AuthFragments } from "@/types/auth";
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';


const AuthContext = createContext<{
  auth_url?: string | null;
  session: string | null;
  isLoading: boolean;
  /** this installation's id — also the playback device id a transfer targets */
  deviceId: string | null;
  signIn: (param: AuthFragments & {auth_url?: string | null}) => void;
  signOut: () => void;
  getSession: () => AuthFragments | null;
}>({
  isLoading: false,
  session: null,
  deviceId: null,
  signIn: (param: AuthFragments) => null,
  signOut: () => null,
  getSession: () : AuthFragments | null => null,
});

// This hook can be used to access the user info.
export function useSession() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useSession must be wrapped in a <SessionProvider />');
  }
  return value;
}

export function SessionProvider({children}: PropsWithChildren) {
  const [[, auth_url], setAuthUrl] = useStorageState('auth_url');
  const [[isLoading, session], setSession] = useStorageState('session');
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const parsed = useMemo<AuthFragments | null>(
    () => (session ? (JSON.parse(session) as AuthFragments) : null),
    [session],
  );

  // The device id is resolved on every launch, logged in or not: it is what the
  // login flow signs the VK grant with AND what a playback transfer is
  // addressed to.
  useEffect(() => {
    let cancelled = false;
    ensureDeviceId().then((id) => {
      if (!cancelled) setDeviceId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sessions minted before the app kept a device id have none stored. Rather
  // than making those users log in again, adopt this installation's id and
  // write it back into the session, so `x-auth-device` is sent from now on and
  // the account gets a stable, nameable device. VK only requires the id to be
  // consistent — the backend used to invent a fresh one per request anyway.
  useEffect(() => {
    if (!parsed || !deviceId || parsed.device_id) return;
    console.log("==session: backfilling the device id of an older login");
    setSession(JSON.stringify({...parsed, device_id: deviceId}));
  }, [parsed, deviceId]);

  const clearSession = useCallback(() => {
    setSession(null);
    setAuthUrl(null);
  }, [setSession, setAuthUrl]);

  // Signed out from another device.
  //
  // The two things that can find this out — the axios layer and the playback
  // socket — are module singletons that exist outside the tree, so they raise
  // it through services/revocation rather than reaching for a hook. All that is
  // left to do here is what a local sign-out does: drop the stored session. The
  // router already sends a sessionless app to the login screen.
  useEffect(() => {
    onSessionRevoked(clearSession);
    return () => onSessionRevoked(null);
  }, [clearSession]);

  // A fresh session may be revoked in its turn, on this same launch.
  const armedFor = useRef<string | null>(null);
  useEffect(() => {
    const token = parsed?.access_token ?? null;
    if (!token || armedFor.current === token) return;
    armedFor.current = token;
    resetRevocation();
  }, [parsed]);

  // Mirror the stored session into the network layer's auth headers (RN has no
  // cookie jar). Runs on login, on sign-out, and on cold-start once storage loads.
  //
  // DURING RENDER, not in an effect, and that is the whole point. React runs a
  // child's effects BEFORE its parent's, so as an effect this landed after the
  // songs screen had already fired its first request — which went out with no
  // x-auth-* headers and came back 403 "No token or secret". The screen then sat
  // empty until something refreshed it, on every single cold start.
  //
  // `setAuthHeaders` assigns a module-level record and touches no React state,
  // so calling it while rendering is safe, and rendering is the only place early
  // enough to beat the children.
  useMemo(() => setAuthHeaders(parsed), [parsed]);

  return (
    <AuthContext.Provider
      value={{
        signIn: (param: AuthFragments & {auth_url?: string | null;}) => {
          // Perform sign-in logic here
          (param?.access_token && param?.secret && param?.user_id)
            ? setSession(JSON.stringify({...param, device_id: param.device_id ?? deviceId ?? undefined}))
            : null;
          setAuthUrl(param.auth_url??null);
        },
        signOut: clearSession,
        getSession: (): AuthFragments | null => parsed,
        auth_url,
        session,
        deviceId,
        isLoading,
      }}>
      {children}
    </AuthContext.Provider>
  );
}
