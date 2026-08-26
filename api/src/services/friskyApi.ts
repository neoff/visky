// src/services/friskyApi.ts
//
// A thin read-only client for the official radio API, api.frisky.fm/v3.
//
// Only three calls are needed and only two shapes come back:
//
//   GET /v3/artists?limit&offset          -> Artist[]   (the directory)
//   GET /v3/artists/{id}                  -> Artist     (bio, photo, genres)
//   GET /v3/mixes?artists_id&limit&offset -> Mix[]      (tracklist, genres, show)
//
// There is NO search: `?title=`, `?url=` and `?q=` are accepted and silently
// ignored (they return an empty body), so everything is filtered by id or
// mirrored wholesale. That is the reason the artist directory is cached at all.
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

/** One page of the artist directory. An empty page means the end of it. */
export const fetchArtistPage = async (offset: number, limit = cfg.pageSize): Promise<FriskyArtistDto[]> =>
  serialised(async () => {
    const response = await http().get("/artists", {params: {limit, offset}});
    return asArray<FriskyArtistDto>(response?.data);
  }, []);

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
