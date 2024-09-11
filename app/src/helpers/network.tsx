import {apiUrls, headers} from "@/constants";
import axios, {AxiosRequestConfig, Method} from "axios";

const apiRequest = async (url: string, method: Method | string, data?: any) => {
  /*if (!url) {
    console.error("===Auth: No Token in apiUrls.vkTokenUrl:", url);
    throw new Error("No Token!");
  }*/
  //console.log("===Auth: Token in apiUrls.vkTokenUrl:", url);
  const config: AxiosRequestConfig = {
    url: url,
    method: method,
    data: data,
    headers: headers,
  }
  console.debug("==apiRequest config:", config);

  return await axios
    .request(config)
    .then(response => {
      //console.debug('---->apiRequest-response:', response.data);
      return response.data;
    })
    .catch(error => {
      console.error('==ERROR apiRequest: ', error);
      console.error('==ERROR apiRequest: ', error.data);
      throw error;
    });
}

export const getAuth = ({onLoad}: {onLoad?: (fragments: any) => void}, url?: string | null) => {
  console.debug("getAuth url:", url);
  if (!url) return;
  apiRequest(apiUrls.tokenUrl, 'POST', {"vkurl": url})
    .then((data) => {
      console.log("--->getAuth-response:", data);
      if(data.redirect){
        return refreshToken({onLoad: onLoad}, data.redirect);
      }
      onLoad?.(data);
    })
    .catch((error) => {
      console.error(`===ERROR! getAuth:${error.data}`);
      throw error;
    });
}

export const refreshToken = ({onLoad}: {onLoad?: (fragments: any) => void}, url?: string | null) => {
  console.debug("getAuth url:", url);
  if (!url) return;
  apiRequest(apiUrls.refreshUrl, 'GET', {"vkurl": url})
    .then((data) => {
      console.log("--->refreshToken-response:", data);
      onLoad?.(data);
    })
    .catch((error) => {
      console.error(`===ERROR! refreshToken:${error.data}`);
      throw error;
    });
}

export const loadPlaylistData = async (onLoad?: (fragments: any) => any, onError?: (error: any) => void, offset: number = 0) => {
  console.info(`GET ${apiUrls.friskyListUrl}?count=100&offset=0`);
  return apiRequest(`${apiUrls.friskyListUrl}?count=100&offset=${offset}`, 'GET')
    .then((data) => {
      //console.log("--->loadPlaylistData-response:", data);
      return onLoad?.(data);
      //return data;
    })
    .catch((error)  => {
      console.error(`===ERROR! loadPlaylistData:${error.data}`);
      throw onError?.(error);
    });
};
export const loadFavoriveData = async (owner:string, onLoad?: (fragments: any) => any, onError?: (error: any) => void, offset: number = 0) => {
  console.info(`GET ${apiUrls.favoritesListUrl}?count=100&offset=0`);
  return apiRequest(`${apiUrls.favoritesListUrl}?count=100&offset=${offset}&owner=${owner}`, 'GET')
    .then((data) => {
      //console.log("--->loadPlaylistData-response:", data);
      return onLoad?.(data);
      //return data;
    })
    .catch((error)  => {
      console.error(`===ERROR! loadPlaylistData:${error.data}`);
      onError?.(error);
      throw error;
    });
};



/*
const authOf = async (url: string) => {
  return await axios
    .get(url, {headers: headers})
    .then(response => {
      return response.data;
    })
    .catch(error => {
      throw error;
    })

}
export const getAuthOfficial = ({onLoad}: {onLoad?: (fragments: any) => void}) => {
  authOf(apiUrls.authFormUrl)
    .then((data) => {
      //console.log("======HAVE RESPONSE!", data);
      onLoad?.(data);
    })
    .catch((error) => {
      console.error("auth error", error);
      //signOut();
    })
}*/
