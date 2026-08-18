import {useStorageState} from "@/hooks/useStorageState";
import {AuthFragments} from "@/types/auth";
import {createContext, useContext, useEffect, useLayoutEffect, type PropsWithChildren} from 'react';
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

// Store current session data for interceptor
let currentSessionData: AuthFragments | null = null;

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

  // Setup axios interceptor once on mount
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        if (currentSessionData?.access_token && currentSessionData?.user_id) {
          config.headers['x-auth-token'] = currentSessionData.access_token;
          config.headers['x-auth-user'] = currentSessionData.user_id;
          if (currentSessionData.secret) {
            config.headers['x-auth-secret'] = currentSessionData.secret;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Cleanup interceptor on unmount
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
    };
  }, []);

  // Update session data when session changes
  useLayoutEffect(() => {
    console.log('===SessionProvider useLayoutEffect triggered, session:', session);
    console.log('===SessionProvider isLoading:', isLoading);
    
    // Don't update headers while still loading
    if (isLoading) {
      console.log('===SessionProvider still loading, skipping header update');
      return;
    }
    
    if (!session) {
      // Clear session data if no session
      console.log('===SessionProvider clearing session data (no session)');
      currentSessionData = null;
      return;
    }

    try {
      const parsed: AuthFragments = JSON.parse(session);
      console.log('===SessionProvider parsed session:', parsed);
      
      if (parsed?.access_token && parsed?.user_id) {
        // Store session data for interceptor
        console.log('===SessionProvider storing session data:', {
          token: parsed.access_token.substring(0, 20) + '...',
          user: parsed.user_id,
          secret: parsed.secret ? parsed.secret.substring(0, 20) + '...' : 'none'
        });
        currentSessionData = parsed;
        console.log('===SessionProvider session data stored successfully');
      } else {
        console.log('===SessionProvider missing required fields:', {
          hasToken: !!parsed?.access_token,
          hasSecret: !!parsed?.secret,
          hasUser: !!parsed?.user_id
        });
        currentSessionData = null;
      }
    } catch (error) {
      console.error('===SessionProvider error parsing session:', error);
      currentSessionData = null;
    }
  }, [session, isLoading]);

  return (
    <AuthContext.Provider
      value={{
        signIn: (param: AuthFragments & { auth_url?: string | null; }) => {
          if (param?.access_token && param?.user_id) {
            setSession(JSON.stringify(param));
            // Store session data for interceptor
            currentSessionData = param;
          }
          setAuthUrl(param.auth_url ?? null);
        },
        signOut: () => {
          setSession(null);
          setAuthUrl(null);
          currentSessionData = null;
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
