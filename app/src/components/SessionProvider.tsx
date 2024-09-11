import {useContext, createContext, type PropsWithChildren} from 'react';
import {useStorageState} from "@/hooks/useStorageState";

export type AuthFragments = {
  session?: string | null;
  [key: string]: any;
};

const AuthContext = createContext<AuthFragments & {
  auth_url?: string | null;
  isLoading: boolean;
  signIn: (param: AuthFragments) => void;
  signOut: () => void;
}>({
  isLoading: false,
  signIn: (param: AuthFragments) => null,
  signOut: () => null,
  getSession: (): {} | null => null,
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
        signIn: (param: AuthFragments) => {
          // Perform sign-in logic here
          param.session?setSession(JSON.stringify(param.session)):null;
          setAuthUrl(param.auth_url);
        },
        signOut: () => {
          setSession(null);
          setAuthUrl(null);

        },
        getSession: (): {} => {
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
