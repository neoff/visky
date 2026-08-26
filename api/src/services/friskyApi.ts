// src/services/friskyApi.ts
//
// A thin read-only client for the official radio API, api.frisky.fm/v3.
//
//   GET /v3/search?query&limit&offset     -> {Mixes, Shows, Episodes, Artists}
//   GET /v3/mixes?artists_id&limit&offset -> Mix[]      (tracklist, genres, show)
//   GET /v3/mixes/{id}                    -> Mix
//   GET /v3/artists/{id}                  -> Artist     (bio, photo, genres)
//
// `/search` is the one text entry point, and it is easy to miss: the REST-looking
// filters do NOT search. `/mixes?title=`, `?url=` and `?q=` are accepted and
// answer with an empty body — silently, not with an error — and the only filters
// that work on the collection routes are `<model>_id`. Everything textual goes
// through `/search`, which answers with all four models at once.
//
// Nothing here throws into a request path — every caller is a background job,
// and a frisky.fm outage must be invisible to the app.
import axios, {AxiosInstance} from "axios";
import {frisky as cfg} from "@/configurations/frisky";

export interface FriskyPhoto {
  url?: string;
  thumb_url?: string;
}

export interface FriskyArtistDto {
  id: number;
  title?: string;
  url?: string;
  home_city?: string;
  residency?: string;
  genre?: string[];
  biography?: string;
  photo?: FriskyPhoto | null;
  hero?: FriskyPhoto | null;
  facebook_url?: string;
  twitter_url?: string;
  website_url?: string;
  instagram_username?: string;
  reach?: number;
}

/** `{"id":211,"model":"Shows","link":"v3/shows/211"}` — frisky's reference shape */
export interface FriskyRef {
  id?: number;
  model?: string;
  link?: string;
}

/**
 * A broadcast. SEVERAL mixes can share one episode: VK is not alone in cutting a
 * two-hour show up — frisky does it too, and `episode_id` is what says the
 * pieces belong together. `air_start` is the authoritative air date; the mix
 * slug only approximates it and the mix title gives the month at best.
 */
export interface FriskyEpisodeDto {
  id: number;
  title?: string;
  url?: string;
  summary?: string;
  genre?: string[];
  air_start?: string;
  air_end?: string;
  show_id?: FriskyRef | null;
  artist_id?: FriskyRef | null;
  image?: FriskyPhoto | null;
  thumbnail?: FriskyPhoto | null;
}

export interface FriskyShowDto {
  id: number;
  title?: string;
  url?: string;
  summary?: string;
  genre?: string[] | null;
  artist_id?: FriskyRef | null;
  image?: FriskyPhoto | null;
}

/** Every model `/search` matched, each capped at `limit` independently. */
export interface FriskySearchResult {
  Mixes: FriskyMixDto[];
  Shows: FriskyShowDto[];
  Episodes: FriskyEpisodeDto[];
  Artists: FriskyArtistDto[];
}

export interface FriskyMixDto {
  id: number;
  title?: string;
  url?: string;
  artist_id?: FriskyRef | null;
  genre?: string[];
  track_list?: Array<{title?: string; artist?: string}>;
  show_id?: FriskyRef | null;
  episode_id?: FriskyRef | null;
  image?: FriskyPhoto | null;
  included_as?: string;
  reach?: number;
  favorite_count?: number;
}

let client: AxiosInstance | null = null;

const http = (): AxiosInstance => {
  if (!client) {
    client = axios.create({
      baseURL: cfg.baseUrl,
      timeout: cfg.timeoutMs,
      headers: {"User-Agent": "ViskyApi/1.0 (+https://github.com/neoff/visky)", accept: "application/json"},
      // A SPACE MUST STAY %20. axios encodes query parameters itself and its
      // default encoder finishes with `.replace(/%20/g, "+")` — and frisky does
      // not read `+` as a space: `?query=hurly+burly` answers with four EMPTY
      // arrays, exactly as if the show did not exist, while `hurly%20burly`
      // returns 30 mixes. Every multi-word search silently found nothing, and
      // the tracks were filed as "frisky has never heard of this show".
      paramsSerializer: {encode: encodeURIComponent},
    });
  }
  return client;
};

/** test seam — the instance is module state and would keep a stale baseURL */
export const __resetFriskyClient = (): void => {
  client = null;
};

/** frisky answers slowly and this is never on a request path: one call at a time. */
let queue: Promise<unknown> = Promise.resolve();
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const serialised = async <T>(run: () => Promise<T>, fallback: T): Promise<T> => {
  const next = queue.then(async () => {
    try {
      return await run();
    } catch (error) {
      console.error("==frisky: api call failed:", (error as Error)?.message ?? error);
      return fallback;
    } finally {
      await pause(cfg.requestGapMs);
    }
  });
  // the chain must survive a rejection, or every later call inherits it
  queue = next.catch(() => undefined);
  return next;
};

const asArray = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

/**
 * Text search — the only one there is.
 *
 * Answers with all four models for the same query, so one call resolves a show
 * title into its mixes, the episodes those mixes belong to (with the real air
 * dates) and the artist record, without knowing any id up front.
 */
export const search = async (query: string, limit = cfg.searchLimit, offset = 0): Promise<FriskySearchResult> =>
  serialised(async () => {
    const response = await http().get("/search", {params: {query, limit, offset}});
    const data = (response?.data ?? {}) as Partial<FriskySearchResult>;
    return {
      Mixes: asArray<FriskyMixDto>(data.Mixes),
      Shows: asArray<FriskyShowDto>(data.Shows),
      Episodes: asArray<FriskyEpisodeDto>(data.Episodes),
      Artists: asArray<FriskyArtistDto>(data.Artists),
    };
  }, {Mixes: [], Shows: [], Episodes: [], Artists: []});

/** One mix by id — used to fill in a tracklist the search result did not carry. */
export const fetchMix = async (id: number): Promise<FriskyMixDto | null> =>
  serialised(async () => {
    const response = await http().get(`/mixes/${id}`);
    const data = response?.data;
    return data && typeof data === "object" && "id" in data ? (data as FriskyMixDto) : null;
  }, null);

export const fetchArtist = async (id: number): Promise<FriskyArtistDto | null> =>
  serialised(async () => {
    const response = await http().get(`/artists/${id}`);
    const data = response?.data;
    return data && typeof data === "object" && "id" in data ? (data as FriskyArtistDto) : null;
  }, null);

/**
 * One page of an artist's mixes, newest first.
 *
 * `order=-id` rather than `-reach`: paging has to be stable while the pages are
 * being read, and reach changes with every listener.
 */
export const fetchArtistMixes = async (
  artistId: number,
  offset: number,
  limit = cfg.pageSize,
): Promise<FriskyMixDto[]> =>
  serialised(async () => {
    const response = await http().get("/mixes", {params: {artists_id: artistId, limit, offset, order: "-id"}});
    return asArray<FriskyMixDto>(response?.data);
  }, []);
