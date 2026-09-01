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
 * Parts of one broadcast are uploaded together; a rerun of the same slot months
 * later is a different show. A day is far wider than the minutes between two
 * halves of one episode and far narrower than the gap between two editions.
 */
const PART_GROUP_WINDOW_S = 24 * 60 * 60

type PartGroup = {anchor?: number; order: number; items: any[]}

/**
 * The groups opened for one artist + base title, indexed by air date.
 *
 * `buckets` is keyed on `floor(anchor / window)`. Two moments less than a window
 * apart always land in the same bucket or in adjacent ones, so a lookup reads
 * three buckets rather than walking every group the key has ever opened. That
 * distinction is the whole point on the search route, which sorts the entire
 * catalogue in one pass: a weekly slot hosted by the same artist for years gives
 * one key hundreds of groups, and a linear scan per item made the pass
 * quadratic in the size of the catalogue.
 */
type KeySlot = {
    /** Earliest group opened for the key — what an item with no date joins. */
    first: PartGroup
    /** floor(anchor / window) -> groups anchored there, in insertion order. */
    buckets: Map<number, PartGroup[]>
}

const bucketOf = (date: number): number => Math.floor(date / PART_GROUP_WINDOW_S)

/**
 * The group an item belongs to, or undefined when it opens a new one. Mirrors
 * the linear search this replaced, tie-break included: when more than one group
 * is in range, the earliest-opened one wins.
 */
const findPartGroup = (slot: KeySlot, date: number | undefined): PartGroup | undefined => {
    // An item with no date joins whatever group its title names: that is the
    // pre-existing behaviour, and VK always sends a date anyway. It holds in
    // reverse too — a group opened by a dateless item accepts any date — and
    // such a group can only ever be the key's first, because a dateless item
    // joins an existing group whenever there is one.
    if (date === undefined || slot.first.anchor === undefined) return slot.first

    let best: PartGroup | undefined
    const centre = bucketOf(date)

    for (let bucket = centre - 1; bucket <= centre + 1; bucket++) {
        for (const candidate of slot.buckets.get(bucket) ?? []) {
            if (Math.abs(candidate.anchor! - date) > PART_GROUP_WINDOW_S) continue
            if (!best || candidate.order < best.order) best = candidate
        }
    }

    return best
}

/**
 * Group tracks that belong to the same multipart show and order them Part 1,
 * Part 2, Part 3. The group keeps the position of its first member, so the
 * overall (date descending) order of the playlist is preserved.
 *
 * A group is identified by ARTIST + base title + when it aired, not by the base
 * title alone. FRISKY titles are slot names, not show names: "Artist of the
 * Week" comes back every week with somebody else behind the decks, and the
 * search route sorts the whole catalogue at once, where a slot repeats for
 * years. Keyed on the title alone, Selsi's two halves and Boraa's two halves
 * fell into one group and came out interleaved — Part 1, Part 1, Part 2, Part 2.
 */
export const  sortLocalPartTracks = (data: VkPlaylistResponse): VkPlaylistResponse =>{
    // artist + base title -> the groups opened for it so far
    const slots = new Map<string, KeySlot>();
    // every group, in the order they were opened: `order` indexes into this
    const allGroups: PartGroup[] = [];
    const sortedItems: any[] = [];

    for (const item of data.items) {
        const match = item.title?.match(partRegex);

        if (!match) {
            sortedItems.push(item);
            continue;
        }

        const key = `${item.artist?.trim().toLowerCase() ?? ""}\u0000${match[1].toLowerCase()}`;
        const date = typeof item.date === "number" ? item.date : undefined;
        let slot = slots.get(key);
        const group = slot ? findPartGroup(slot, date) : undefined;

        if (group) {
            group.items.push(item);
            continue;
        }

        const fresh: PartGroup = {anchor: date, order: allGroups.length, items: [item]};
        allGroups.push(fresh);

        if (!slot) {
            slot = {first: fresh, buckets: new Map()};
            slots.set(key, slot);
        }

        if (date !== undefined) {
            const bucket = bucketOf(date);
            const anchored = slot.buckets.get(bucket);
            if (anchored) anchored.push(fresh);
            else slot.buckets.set(bucket, [fresh]);
        }

        // placeholder: the whole group is spliced in at this position later
        sortedItems.push(fresh.items);
    }

    for (const group of allGroups) {
        group.items.sort((a, b) => {
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
                // VK says nothing about parts; the title does, and it is the
                // same rule the part-grouping above uses
                multipart: partRegex.test(item.title ?? ""),
                // EMPTY, not a placeholder. These two used to carry a fake
                // "Unknown Genre" and a row reading "string — string", which the
                // app rendered as if it were real. The genres and the tracklist
                // come from frisky.fm (services/friskyCache) and are merged in
                // after this — a track nothing is known about gets nothing.
                genre_list: [],
                track_list: [],
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

