import {useStorageState} from "@/hooks/useStorageState";
import {AuthFragments} from "@/types/auth";
import {createContext, useContext, type PropsWithChildren} from 'react';
import axios from 'axios';


const AuthContext = createContext<{
  auth_url?: string | null;
  session: string | null;
  isLoading: boolean;
  signIn: (param: AuthFragments & { auth_url?: string | null }) => void;
  signOut: () => void;
  getSession: () => AuthFragments | null;
}>({
  isLoading: false,
  session: null,
  signIn: (param: AuthFragments) => null,
  signOut: () => null,
  getSession: (): AuthFragments | null => null,
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

  return (
    <AuthContext.Provider
      value={{
        signIn: (param: AuthFragments & { auth_url?: string | null; }) => {
          // Perform sign-in logic here
          if (param?.access_token && param?.secret && param?.user_id) {
            setSession(JSON.stringify(param));
            // Propagate auth headers to axios for backend that reads headers when cookies are missing
            axios.defaults.headers.common['Authorization'] = `Bearer ${param.access_token}`;
            axios.defaults.headers.common['x-auth-token'] = param.access_token;
            axios.defaults.headers.common['x-auth-user'] = param.user_id;
            axios.defaults.headers.common['x-auth-secret'] = param.secret;
          }
          setAuthUrl(param.auth_url ?? null);
        },
        signOut: () => {
          setSession(null);
          setAuthUrl(null);
          axios.defaults.headers.common['Authorization'] = '';
          axios.defaults.headers.common['x-auth-token'] = '';
          axios.defaults.headers.common['x-auth-user'] = '';
          axios.defaults.headers.common['x-auth-secret'] = '';

        },
        getSession: (): AuthFragments | null => {
          return session ? JSON.parse(session) : null;
        },
        auth_url,
        session,
        isLoading,
      }}>
      {children}
    </AuthContext.Provider>
  );
}
