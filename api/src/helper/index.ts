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

// Titles arrive in two shapes, and the two FIELDS are swapped between them:
//
//   old  artist "FRISKY | Wander"   title "December 2024 - Michael McGarrity [vk.com/feelin_frisky]"
//   new  artist "Michael McGarrity" title "FRISKY | Wander December 2024 - Part 2"
//
// So the old era put the SHOW in `artist` and the DJ in `title`; the new era
// has them the right way round, which is also how frisky.fm writes a mix:
// "Wander - December 2024 - Michael McGarrity". Nothing here reorders the
// fields — VK is the one that changed and both shapes are served as they come.
// All this has to do is take the air date out of the title, because the app
// shows the date in its own right and does not want it twice.
const friskyPrefixRegex = /^\s*FRISKY\s*\|\s*/i
const vkSuffixRegex = /\s*\[vk\.com\/[^\]]*]/gi
const partRegex = /^(.*?)\s*(?:[-\u2013\u2014]\s*)?\(?\s*Part\s+(\d+)\s*\)?$/i

const MONTHS =
    "January|February|March|April|May|June|July|August|September|October|November|December"

/**
 * The air date, wherever in the title it sits, with whichever dash was holding
 * it there.
 *
 * One expression for both eras: the date is a PREFIX in the old shape
 * ("December 2024 - Michael McGarrity") and an INFIX in the new one
 * ("Wander December 2024 - Part 2"), and the surrounding punctuation differs,
 * but what has to go is the same chunk in both.
 *
 * Written narrowly on purpose, because the rule this replaces was
 * `/\w+? \d{4} - /g` — ANY word before a year — and the catalogue shows what
 * that costs. It rewrote real, non-FRISKY uploads into nonsense:
 *
 *   "One Side Of The Underground 2026 - Part 2"    -> "One Side Of The Part 2"
 *   "live @ Arenes de Nimes for Cercle 2022 - ..." -> "live @ Arenes de Nimes for ..."
 *   "29-Sep-2025 Boom Festival 2025 - Part 1"      -> "29-Sep-2025 Boom Part 1"
 *
 * Only real month names match now, so all three are left alone. Spelled out
 * rather than abbreviated: VK always writes the month in full, and accepting
 * "Sep" would put the Boom Festival row straight back in the list above.
 *
 * The boundaries are what keep a date that belongs to the title itself:
 * `(^|\s)` refuses a month sitting inside brackets, and the tail must be the
 * end of the string or a dash, so "Purple Sky 39 (September 2019)" and
 * "Memories of September 2020 Remix" both survive intact.
 */
const airDateRegex = new RegExp(
    `(?:^|\\s)[-\\u2013\\u2014]?\\s*(?:${MONTHS})\\s+\\d{4}(?:\\s*[-\\u2013\\u2014]\\s*|\\s*$)`,
    "i",
)

/**
 * The air month a raw title carries ("November 2026"), lower-cased, or "" when
 * it carries none.
 *
 * `cleanupData` takes it out of the title — a list row reads "Gedonizm", not
 * "Gedonizm November 2026" — but it is half of what tells one edition of a
 * monthly show from the next. Without it every edition had the same identity,
 * so a favourite from October lit the heart on November's upload.
 */
export const airMonthOf = (title: string | null | undefined): string => {
    const match = title?.match(airDateRegex);
    if (!match) return "";
    return match[0].replace(/[-\u2013\u2014]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export const cleanupData = (data: VkPlaylistResponse): VkPlaylistResponse => {
    data.items = data?.items?.map((item) => {
        item.artist = item.artist?.replace(friskyPrefixRegex, "");
        item.title = item.title?.replace(friskyPrefixRegex, "");
        // The group's advert goes first: in the new shape the date is the LAST
        // thing in the title, and it is only last once this is gone.
        item.title = item.title?.replace(vkSuffixRegex, "");
        // Kept before it is cut, and only the first time: a second cleanup of
        // the same item finds no date left and must not erase the one it had.
        const raw = item as {air?: string};
        if (raw.air === undefined) raw.air = airMonthOf(item.title);
        // A space, not nothing: the date can sit between two halves of the
        // title ("Wander December 2024 - Part 2"), and joining them would read
        // "WanderPart 2".
        item.title = item.title?.replace(airDateRegex, " ");
        item.title = item.title?.replace(/\s{2,}/g, " ").trim();
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
/**
 * The same grouping `sortLocalPartTracks` does, but returned as the groups
 * themselves: one inner array per show, its parts in Part-1..Part-N order, and
 * a single-element array for every track that is not multipart. The order of
 * the outer array is the playlist order (a group holds its first member's
 * place). `sortLocalPartTracks` is this flattened; the v2 list merges each inner
 * array into one row instead.
 */
export const groupLocalPartTracks = (data: VkPlaylistResponse): any[][] => {
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

    // A bare item is a single-part track; wrap it so every entry is a group.
    return sortedItems.map((entry) => Array.isArray(entry) ? entry : [entry]);
}

export const sortLocalPartTracks = (data: VkPlaylistResponse): VkPlaylistResponse => {
    data.items = groupLocalPartTracks(data).flat();
    return data;
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
                // the edition, for telling a favourite apart from next month's upload
                air: (item as {air?: string}).air ?? "",
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

/**
 * The part number a cleaned title carries, or `undefined` for a single-part
 * track. `cleanupData` has already dropped the air date, so "Wander Part 2"
 * reaches here as "Wander Part 2" and this reads the 2.
 */
const partNumber = (title: string | null | undefined): number | undefined => {
    const match = title?.match(partRegex);
    return match ? Number(match[2]) : undefined;
}

/**
 * The show's name without the "Part N" tail, so a merged row reads "Wander",
 * not "Wander Part 1". Falls back to the whole title when there is no tail.
 */
const baseTitle = (title: string | null | undefined): string => {
    const match = title?.match(partRegex);
    return (match ? match[1] : title ?? "").trim();
}

/**
 * v2 of the list shape: one row per SHOW, with the parts carried as an array.
 *
 * The input is the grouping from `groupLocalPartTracks` — each inner array is a
 * show's parts in order. A multipart show collapses to a single `TrackItem`
 * whose `part_list` holds every part (its own VK ids, url and duration) and
 * whose `duration` is the whole show; the app expands that back into the same
 * per-part queue entries v1 served, so nothing about playback changes. A
 * single-part track is the same row v1 produced, with a one-element part_list.
 */
export const formatPlaylistV2 = (groups: any[][], offset?: number, total?: number): Tracklist => {
    const items = groups.map((parts): TrackItem => {
        // the representative is Part 1 (groups arrive Part-1-first)
        const head = parts[0];
        const multipart = parts.length > 1;
        const part_list = parts.map((part, index) => ({
            owner_id: part.owner_id,
            id: part.id,
            url: part.url,
            part: partNumber(part.title) ?? index + 1,
            duration: part.duration,
        }));
        // the show's length is the sum of its parts; a single part keeps its own
        const duration = part_list.reduce((sum, part) => sum + (Number(part.duration) || 0), 0)
            || head.duration;

        return {
            id: head.id,
            owner_id: head.owner_id,
            url: head.url,
            // the base name for a merged show, the plain title for a single track
            title: multipart ? baseTitle(head.title) : head.title,
            artist: head.artist,
            duration,
            date: head.date,
            air: head.air ?? "",
            artwork: head.album?.thumb?.photo_300 ?? undefined,
            type: TrackItem.type.HLS,
            favorite: head.like ?? false,
            hidden: false,
            multipart,
            genre_list: [],
            track_list: [],
            part_list,
        } as TrackItem;
    });

    return {
        count: items.length,
        offset: offset || 0,
        total: total ?? items.length,
        items,
    } as Tracklist;
}

export const md5 = (contents: string) => crypto.createHash('md5').update(contents).digest("hex");

