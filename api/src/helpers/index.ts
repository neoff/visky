// helpers/index.ts
import * as crypto from 'crypto';
import { wrapper } from 'axios-cookiejar-support';
import axios, { AxiosError } from "axios";
import {Item, Playlist, Request, Response} from "@/types"


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

export const cleanupData = (data: Playlist): Playlist => {
    //remove from items.artist "FRISKY | " and from items.title  [vk.com/feelin_frisky]"
    data.items = data?.items?.map((item: Item) => {
        item.artist = item.artist.replace("FRISKY | ", "");
        item.type = "hls";
        item.title = item.title.replace(/\w+? \d{4} - /g, "");
        item.title = item.title.replace(/ \[vk\.com\/feelin_frisky]/g, "");
        return item;
    });
    return data;
}

export const  sortLocalPartTracks = (data: Playlist): Playlist =>{
    const partRegex = /^(.*)\s+\(Part (\d+)\)$/i

    const sortedItems: Item[] = [];
    let i = 0;

    while (i < data.items.length) {
        const match = data.items[i].title.match(partRegex);

        if (match) {
            const baseTitle = match[1]
            const group: Item[] = [];

            while (i < data.items.length) {
                const m = data.items[i].title.match(partRegex);
                if (!m || m[1] !== baseTitle) break;
                group.push(data.items[i]);
                i++
            }

            // отсортировать Part N по номеру
            group.sort((a, b) => {
                const aNum = Number(a.title.match(partRegex)![2]);
                const bNum = Number(b.title.match(partRegex)![2]);
                return aNum - bNum;
            })

            sortedItems.push(...group);
        } else {
            sortedItems.push(data.items[i]);
            i++
        }
    }
    data.items = sortedItems;
    return data
}

export const cleanupDataAndSortPart = (data: Playlist): Playlist => {
    const cleanedData = cleanupData(data);
    return sortLocalPartTracks(cleanedData);
}

export const md5 = (contents: string) => crypto.createHash('md5').update(contents).digest("hex");

