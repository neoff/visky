// helpers/index.ts
import * as crypto from 'crypto';
import { wrapper } from 'axios-cookiejar-support';
import axios from "axios";
import {TrackItem, Tracklist, VkPlaylistResponse} from "@/__genedated__/openapi/vk";


export const TokenUrl = "https://oauth.vk.com/token"
export const AuthUrl = "https://oauth.vk.com/authorize"
export const AuthUrlNew = "https://id.vk.ru/authorize"  // New VK ID endpoint
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

// Titles arrive in two shapes:
//   old: artist "FRISKY | Blue",  title "Event 2024 - Mix (Part 2) [vk.com/feelin_frisky]"
//   new: artist "Melamanos",      title "FRISKY | Artist of the Week August 2026 - Part 2"
// Both rules are kept: the old cleanup is untouched, the "FRISKY | " prefix is
// now stripped from the title too, and the part suffix is matched in both the
// "(Part N)" and "- Part N" / "Part N" spellings.
const friskyPrefixRegex = /^\s*FRISKY\s*\|\s*/i
const partRegex = /^(.*?)\s*(?:[-\u2013\u2014]\s*)?\(?\s*Part\s+(\d+)\s*\)?$/i

export const cleanupData = (data: VkPlaylistResponse): VkPlaylistResponse => {
    //remove from items.artist/title "FRISKY | ", the "Month YYYY - " prefix and the "[vk.com/feelin_frisky]" suffix
    data.items = data?.items?.map((item) => {
        item.artist = item.artist?.replace(friskyPrefixRegex, "");
        item.title = item.title?.replace(friskyPrefixRegex, "");
        item.title = item.title?.replace(/\w+? \d{4} - /g, "");
        item.title = item.title?.replace(/ \[vk\.com\/feelin_frisky]/g, "");
        item.title = item.title?.trim();
        return item;
    });
    return data;
}

/**
 * Group tracks that belong to the same multipart show and order them Part 1,
 * Part 2, Part 3. The group keeps the position of its first member, so the
 * overall (date descending) order of the playlist is preserved.
 */
export const  sortLocalPartTracks = (data: VkPlaylistResponse): VkPlaylistResponse =>{
    const groups = new Map<string, any[]>();
    const sortedItems: any[] = [];

    for (const item of data.items) {
        const match = item.title?.match(partRegex);

        if (!match) {
            sortedItems.push(item);
            continue;
        }

        const baseTitle = match[1].toLowerCase();
        const group = groups.get(baseTitle);

        if (group) {
            group.push(item);
        } else {
            const newGroup = [item];
            groups.set(baseTitle, newGroup);
            // placeholder: the whole group is spliced in at this position later
            sortedItems.push(newGroup);
        }
    }

    for (const group of groups.values()) {
        group.sort((a, b) => {
            const aNum = Number(a.title?.match(partRegex)![2]);
            const bNum = Number(b.title?.match(partRegex)![2]);
            return aNum - bNum;
        })
    }

    data.items = sortedItems.flatMap((entry) => Array.isArray(entry) ? entry : [entry]);
    return data
}

export const cleanupDataAndSortPart = (data: VkPlaylistResponse): VkPlaylistResponse => {
    const cleanedData = cleanupData(data);
    return sortLocalPartTracks(cleanedData);
}

export const formatPlaylist = (data: VkPlaylistResponse, offset?: number): Tracklist => {
    return  {
        count: data.items.length || 0,
        offset: offset || 0,
        total: data.count || 0,
        items: data.items.map((item): TrackItem => {
            return {
                id: item.id,
                // the app needs owner_id to talk about a track to VK
                // (audio.add / audio.delete are addressed by owner_id + audio_id)
                owner_id: item.owner_id,
                url: item.url,
                title: item.title,
                artist: item.artist,
                duration: item.duration,
                date: item.date,
                artwork: item.album?.thumb?.photo_300 ?? undefined,
                type: TrackItem.type.HLS,
                favorite:  item.like?? false, //TODO: hardcoded
                hidden:  false, //TODO: hardcoded
                multipart: false, //TODO: hardcoded
                genre_list: [{ //TODO: hardcoded
                    id: 0,
                    name: "Unknown Genre",
                }],//item.genre_list?.map((genre) => ({
                track_list: [{  //TODO: hardcoded
                    id: 0,
                    title: "string",
                    artist: "string",
                    duration: 0,
                    time_code: "00:00:00",
                    spotify: "string",
                    youtube: "string",
                    apple_music: "string",
                }],//item.track_list?.map((track: TrackContent) => ({
                part_list: [{ //TODO: hardcoded
                    url: item.url,
                    part: 1,
                    duration: item.duration,
                }]//item.part_list?.map((part) => ({
            } as TrackItem;
        })
    } as Tracklist
}

export const md5 = (contents: string) => crypto.createHash('md5').update(contents).digest("hex");

