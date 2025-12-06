import {useStorageState} from "@/hooks/useStorageState";
import {AuthFragments} from "@/types/auth";
import {createContext, useContext, useEffect, type PropsWithChildren} from 'react';
import axios from 'axios';
import CookieManager from '@react-native-cookies/cookies';
import {apiUrls} from "@/constants";


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

  // Rehydrate session from storage on mount
  useEffect(() => {
    if (!session) {
      // Clear headers if no session
      axios.defaults.headers.common['x-auth-token'] = '';
      axios.defaults.headers.common['x-auth-user'] = '';
      axios.defaults.headers.common['x-auth-secret'] = '';
      return;
    }

    try {
      const parsed: AuthFragments = JSON.parse(session);
      if (parsed?.access_token && parsed?.secret && parsed?.user_id) {
        // Keep headers as fallback for backward compatibility
        axios.defaults.headers.common['x-auth-token'] = parsed.access_token;
        axios.defaults.headers.common['x-auth-user'] = parsed.user_id;
        axios.defaults.headers.common['x-auth-secret'] = parsed.secret;
        
        // Restore session on backend via cookie
        restoreSessionCookie(parsed);
      }
    } catch (error) {
      axios.defaults.headers.common['x-auth-token'] = '';
      axios.defaults.headers.common['x-auth-user'] = '';
      axios.defaults.headers.common['x-auth-secret'] = '';
    }
  }, [session]);

  const restoreSessionCookie = async (sessionData: AuthFragments) => {
    try {
      await axios.post(apiUrls.refreshUrl, sessionData);
      console.log('✅ Session cookie restored');
    } catch (error) {
      console.error('❌ Failed to restore session cookie:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        signIn: async (param: AuthFragments & { auth_url?: string | null; }) => {
          if (param?.access_token && param?.secret && param?.user_id) {
            setSession(JSON.stringify(param));
            // Keep headers as fallback
            axios.defaults.headers.common['x-auth-token'] = param.access_token;
            axios.defaults.headers.common['x-auth-user'] = param.user_id;
            axios.defaults.headers.common['x-auth-secret'] = param.secret;
            
            // Establish session cookie on backend
            try {
              await axios.post(apiUrls.refreshUrl, param);
              console.log('✅ Session cookie established');
            } catch (error) {
              console.error('❌ Failed to establish session cookie:', error);
            }
          }
          setAuthUrl(param.auth_url ?? null);
        },
        signOut: async () => {
          setSession(null);
          setAuthUrl(null);
          axios.defaults.headers.common['x-auth-token'] = '';
          axios.defaults.headers.common['x-auth-user'] = '';
          axios.defaults.headers.common['x-auth-secret'] = '';
          
          // Clear cookies
          try {
            const baseUrl = new URL(apiUrls.baseUrl);
            await CookieManager.clearAll();
            console.log('✅ Cookies cleared');
          } catch (error) {
            console.error('❌ Failed to clear cookies:', error);
          }
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
