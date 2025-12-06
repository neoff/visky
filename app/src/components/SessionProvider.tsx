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

  // Synchronously update headers when session or isLoading changes
  // useLayoutEffect runs synchronously BEFORE children render
  // This ensures headers are set BEFORE any component can make API calls
  useLayoutEffect(() => {
    console.log('===SessionProvider useLayoutEffect triggered, session:', session);
    console.log('===SessionProvider isLoading:', isLoading);
    
    // Don't update headers while still loading
    if (isLoading) {
      console.log('===SessionProvider still loading, skipping header update');
      return;
    }
    
    if (!session) {
      // Clear headers if no session
      console.log('===SessionProvider clearing headers (no session)');
      axios.defaults.headers.common['x-auth-token'] = '';
      axios.defaults.headers.common['x-auth-user'] = '';
      axios.defaults.headers.common['x-auth-secret'] = '';
      return;
    }

    try {
      const parsed: AuthFragments = JSON.parse(session);
      console.log('===SessionProvider parsed session:', parsed);
      
      if (parsed?.access_token && parsed?.secret && parsed?.user_id) {
        // Set headers immediately for API requests
        console.log('===SessionProvider setting headers:', {
          token: parsed.access_token.substring(0, 20) + '...',
          user: parsed.user_id,
          secret: parsed.secret.substring(0, 20) + '...'
        });
        axios.defaults.headers.common['x-auth-token'] = parsed.access_token;
        axios.defaults.headers.common['x-auth-user'] = parsed.user_id;
        axios.defaults.headers.common['x-auth-secret'] = parsed.secret;
        console.log('===SessionProvider headers set, verify:', {
          token: axios.defaults.headers.common['x-auth-token'],
          user: axios.defaults.headers.common['x-auth-user'],
          secret: axios.defaults.headers.common['x-auth-secret']
        });
      } else {
        console.log('===SessionProvider missing required fields:', {
          hasToken: !!parsed?.access_token,
          hasSecret: !!parsed?.secret,
          hasUser: !!parsed?.user_id
        });
      }
    } catch (error) {
      console.error('===SessionProvider error parsing session:', error);
      axios.defaults.headers.common['x-auth-token'] = '';
      axios.defaults.headers.common['x-auth-user'] = '';
      axios.defaults.headers.common['x-auth-secret'] = '';
    }
  }, [session, isLoading]);

  return (
    <AuthContext.Provider
      value={{
        signIn: (param: AuthFragments & { auth_url?: string | null; }) => {
          if (param?.access_token && param?.secret && param?.user_id) {
            setSession(JSON.stringify(param));
            // Set headers immediately
            axios.defaults.headers.common['x-auth-token'] = param.access_token;
            axios.defaults.headers.common['x-auth-user'] = param.user_id;
            axios.defaults.headers.common['x-auth-secret'] = param.secret;
          }
          setAuthUrl(param.auth_url ?? null);
        },
        signOut: () => {
          setSession(null);
          setAuthUrl(null);
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
