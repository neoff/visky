import * as crypto from 'crypto';
import { wrapper } from 'axios-cookiejar-support';
import axios, { AxiosError } from "axios";
import {Item, Request, Response} from "@/types"


export const TokenUrl = "https://oauth.vk.com/token"
export const AuthUrl = "https://oauth.vk.com/authorize"
export const vkBlankUrl = "https://oauth.vk.com/blank.html"

export const normalizePort = (val: string): number => {
    var port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        //return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return NaN;
}

// CLIENT FOR VK (emulate old android)
const headers = {
    "User-Agent": "VKAndroidApp/4.13.1-1206 (Android 4.4.3; SDK 19; armeabi; ; ru)",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
  }
// axios.defaults.withCredentials = true
export const AndroidClient = wrapper(axios.create({ 
    //withCredentials: true, 
    //jar,
    headers 
}));

export const encodeQueryData = async (data: any): Promise<string>  =>{
    const ret = [];
    for (let d in data)
      ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
    return ret.join('&');
 }

const alphabet = "abcdefghijklmnopqrstuvwxyz0987654321"
export const deviceIDgen = () => {
    let result = "";
    for (let i = 0; i < 16; i++ ) {
        result += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    return result;
}

export const cleanupData = (data: any) => {
    //remove from items.artist "FRISKY | " and from items.title  [vk.com/feelin_frisky]"
    data?.items?.map((item: Item) => {
        item.artist = item.artist.replace("FRISKY | ", "");
        item.type = "hls";
        item.title = item.title.replace(/\w+? \d{4} - /g, "");
        item.title = item.title.replace(/ \[vk\.com\/feelin_frisky]/g, "");
        return item;
    });
    return data;
}

export const md5 = (contents: string) => crypto.createHash('md5').update(contents).digest("hex");

