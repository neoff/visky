import {useEffect, useState} from "react";
import {LoginProps, UserProps} from "@/helpers/types";
import {useAsyncState} from "@/hooks/useStorageState";
import {MMKVLoader} from "react-native-mmkv-storage";

export function useUser(): UserProps {
  const [user, setUser] = useState<UserProps>({user: undefined});

  function onChange(event: { user: UserProps }) {
    setUser(event.user);
  }

  useEffect(() => {
    //getInitialURL().then((url) => setLink(url));
  }, []);

  return user;
}

export const [sessionResponse, setSessionResponse] = useAsyncState<any>();
export const [tokenUrl, setTokenUrl] = useState<string | null>(null);