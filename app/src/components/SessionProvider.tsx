import { useStorageState } from "@/hooks/useStorageState";
import { setAuthHeaders } from "@/helpers/network";
import { AuthFragments } from "@/types/auth";
import { createContext, useContext, useEffect, type PropsWithChildren } from 'react';


const AuthContext = createContext<{
  auth_url?: string | null;
  session: string | null;
  isLoading: boolean;
  signIn: (param: AuthFragments & {auth_url?: string | null}) => void;
  signOut: () => void;
  getSession: () => AuthFragments | null;
}>({
  isLoading: false,
  session: null,
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

  // Mirror the stored session into the network layer's auth headers (RN has no
  // cookie jar). Runs on login, on sign-out, and on cold-start once storage loads.
  useEffect(() => {
    setAuthHeaders(session ? (JSON.parse(session) as AuthFragments) : null);
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        signIn: (param: AuthFragments & {auth_url?: string | null;}) => {
          // Perform sign-in logic here
          (param?.access_token && param?.secret && param?.user_id)?setSession(JSON.stringify(param)):null;
          setAuthUrl(param.auth_url??null);
        },
        signOut: () => {
          setSession(null);
          setAuthUrl(null);

        },
        getSession: (): AuthFragments | null => {
          return  session?JSON.parse(session):null;
        },
        auth_url,
        session,
        isLoading,
      }}>
      {children}
    </AuthContext.Provider>
  );
}
