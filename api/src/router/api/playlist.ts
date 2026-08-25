// src/router/api/playlist.ts
import express from "express";
import {Request, Response} from "@/types";
import {checkAuthAndroid, vkMethod} from "@/helper/vk";
import {cleanupData, cleanupDataAndSortPart, formatPlaylist} from "@/helper";
import {Tracklist, type VkPlaylistResponse, VkResponse, TrackItem} from "@/__genedated__/openapi/vk";


export const api = express.Router();

const FRISKY_OWNER_ID = -42311167;
const FRISKY_FAVORITES_PLAYLIST_TITLE = "Frisky-favorites";

const getPlaylistData =  async (req: Request, owner: number, count: number, offset: number): Promise<Tracklist> => {
  return await vkMethod(req, "audio.get", {
    "count": count,
    "offset": offset,
    "owner_id": owner
  }, false)
    .then((vkResponse: VkResponse) => {
      //console.log("===>>frisky RAW data:", data);
      const response = vkResponse.response as VkPlaylistResponse;
      const clean = cleanupDataAndSortPart(response);
      //console.log("===>>frisky data:", clean);
      return formatPlaylist(clean, offset);
    });
}

/**
 * Identity of a track ACROSS VK copies.
 *
 * `audio.add` copies a track into the user's library under a NEW audio id, so a
 * frisky track and its copy in Frisky-favorites share no id. Artist + title (as
 * cleaned by `cleanupData`, i.e. without the "FRISKY | " prefix) is what stays
 * the same, so that is the key we match on.
 */
const favoriteKey = (item: { artist?: string; title?: string }): string =>
  `${(item.artist ?? "").trim().toLowerCase()}|${(item.title ?? "").trim().toLowerCase()}`;

/**
 * Find the user's own Frisky-favorites playlist.
 *
 * `audio.searchPlaylists` searches ALL of VK, not the user's playlists — it can
 * miss the user's own playlist entirely (a private playlist is not indexed) and
 * can return a STRANGER's playlist of the same name. `audio.getPlaylists` for
 * the session user is the authoritative list; the search stays as a fallback,
 * filtered down to playlists this user owns.
 */
const getFriskyFavoritesPlaylistId = async (req: Request): Promise<number | null> => {
  const userId = req.session.user_id;
  try {
    const own = await vkMethod(req, "audio.getPlaylists", {
      owner_id: userId,
      count: 100
    }, false);
    const items = ((own.response as any)?.items ?? []) as Array<{ id: number; title?: string }>;
    const found = items.find(
      (playlist) => playlist.title?.trim().toLowerCase() === FRISKY_FAVORITES_PLAYLIST_TITLE.toLowerCase()
    );
    if (found) return found.id;
  } catch (error) {
    console.error("Error listing the user's playlists:", error);
  }

  try {
    const searchResult = await vkMethod(req, "audio.searchPlaylists", {
      q: FRISKY_FAVORITES_PLAYLIST_TITLE,
      count: 20
    }, false);
    const items = ((searchResult.response as any)?.items ?? []) as Array<{
      id: number;
      owner_id?: number;
      title?: string;
    }>;
    const mine = items.find(
      (playlist) =>
        String(playlist.owner_id) === String(userId) &&
        playlist.title?.trim().toLowerCase() === FRISKY_FAVORITES_PLAYLIST_TITLE.toLowerCase()
    );
    return mine?.id ?? null;
  } catch (error) {
    console.error("Error searching for Frisky-favorites playlist:", error);
    return null;
  }
}

/**
 * Create Frisky-favorites playlist
 */
const createFriskyFavoritesPlaylist = async (req: Request): Promise<number> => {
  try {
    const createResult = await vkMethod(req, "audio.createPlaylist", {
      title: FRISKY_FAVORITES_PLAYLIST_TITLE,
      owner_id: req.session.user_id
    }, false);
    
    return (createResult.response as any).id;
  } catch (error: any) {
    throw new Error(`Failed to create Frisky-favorites playlist: ${error.message}`);
  }
}

/**
 * The playlist id, creating an EMPTY playlist when the user has none yet.
 *
 * The app must never see "no playlist": the very first tap on a heart has to
 * work, and the Favorites tab of a user who never favourited anything is an
 * empty list, not a 404.
 */
const ensureFriskyFavoritesPlaylistId = async (req: Request): Promise<number> => {
  const existing = await getFriskyFavoritesPlaylistId(req);
  if (existing) return existing;
  return await createFriskyFavoritesPlaylist(req);
}

type FavoriteEntry = { id: number; owner_id: number };

type FavoritesIndex = { playlistId: number | null; byKey: Map<string, FavoriteEntry> };

/**
 * Per-user cache of the favourites index.
 *
 * Every /frisky page would otherwise cost two extra VK calls (the playlist list
 * plus a 6000-track audio.get) just to light up the hearts. VK is not something
 * to hammer, so the index is held for a minute and dropped the moment the user
 * changes it.
 */
const FAVORITES_INDEX_TTL_MS = 60_000;
const favoritesIndexCache = new Map<string, { at: number; index: FavoritesIndex }>();

const invalidateFavoritesIndex = (req: Request): void => {
  favoritesIndexCache.delete(String(req.session.user_id));
}

/** test seam — the module-level cache would otherwise leak between test cases */
export const __resetFavoritesIndexCache = (): void => favoritesIndexCache.clear();

/**
 * Everything currently in Frisky-favorites, keyed by artist|title so a frisky
 * track can be recognised in the user's copy of it. Never throws: a favourites
 * lookup failing must not take the main track list down with it.
 */
const loadFavoritesIndex = async (req: Request, useCache: boolean = true): Promise<FavoritesIndex> => {
  const cacheKey = String(req.session.user_id);
  const cached = favoritesIndexCache.get(cacheKey);
  if (useCache && cached && Date.now() - cached.at < FAVORITES_INDEX_TTL_MS) {
    return cached.index;
  }

  const byKey = new Map<string, FavoriteEntry>();
  try {
    const playlistId = await getFriskyFavoritesPlaylistId(req);
    if (!playlistId) return {playlistId: null, byKey};

    const response = await vkMethod(req, "audio.get", {
      owner_id: req.session.user_id,
      playlist_id: playlistId,
      count: 6000,
      offset: 0
    }, false);

    const playlist = response.response as VkPlaylistResponse;
    // key on the CLEANED artist/title, because that is what /frisky serves
    const clean = cleanupData({count: playlist?.count ?? 0, items: playlist?.items ?? []});
    for (const item of clean.items) {
      byKey.set(favoriteKey(item), {id: item.id, owner_id: item.owner_id});
    }
    const index: FavoritesIndex = {playlistId, byKey};
    favoritesIndexCache.set(cacheKey, {at: Date.now(), index});
    return index;
  } catch (error) {
    console.error("Error loading the Frisky-favorites index:", error);
    return {playlistId: null, byKey};
  }
}




/**
 * Text search over a track list.
 *
 * Every word of the query must appear somewhere in "artist title" — so
 * "dunn sonder" finds "Graham Dunn — Sonder Part 1" without caring about order.
 */
const matchesQuery = (item: { artist?: string; title?: string }, words: string[]): boolean => {
  const haystack = `${item.artist ?? ""} ${item.title ?? ""}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

const queryWords = (query: string): string[] =>
  query.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * The Frisky group's whole catalogue, cached.
 *
 * Search has to cover the group, not the 100 tracks the app happens to have
 * loaded — and VK has no "search inside this owner" call, so the catalogue is
 * pulled once (10k tracks, 6000 per page) and searched here. VK allows three
 * calls a second, hence the cache; the urls it holds are signed but live far
 * longer than the five minutes it is kept.
 */
const FRISKY_CATALOG_TTL_MS = 5 * 60_000;
const FRISKY_CATALOG_PAGE = 6000;
const FRISKY_CATALOG_MAX = 12000;
let friskyCatalog: { at: number; items: VkPlaylistResponse["items"] } | null = null;

const loadFriskyCatalog = async (req: Request): Promise<VkPlaylistResponse["items"]> => {
  if (friskyCatalog && Date.now() - friskyCatalog.at < FRISKY_CATALOG_TTL_MS) {
    return friskyCatalog.items;
  }

  const items: VkPlaylistResponse["items"] = [];
  for (let offset = 0; offset < FRISKY_CATALOG_MAX; offset += FRISKY_CATALOG_PAGE) {
    const response = await vkMethod(req, "audio.get", {
      owner_id: FRISKY_OWNER_ID,
      count: FRISKY_CATALOG_PAGE,
      offset
    }, false);
    const chunk = (response.response as VkPlaylistResponse)?.items ?? [];
    items.push(...chunk);
    if (chunk.length < FRISKY_CATALOG_PAGE) break;
  }

  friskyCatalog = {at: Date.now(), items};
  return items;
}

/** test seam — the catalogue cache is module state, like the favourites index */
export const __resetFriskyCatalog = (): void => {
  friskyCatalog = null;
}

/**
 * Get the frisky from the VK group  Frisky Radio
 */
api.get("/frisky", checkAuthAndroid, async (req: Request, res: Response) => {

  const owner: number = FRISKY_OWNER_ID;
  const count: number = parseInt(req.query?.count as string) || 1;
  const offset: number = parseInt(req.query.offset as string) || 0;
  const words = queryWords((req.query.q as string) ?? "");
  try {
    let response: Tracklist;

    if (words.length > 0) {
      // searching the GROUP, not the page the app is holding
      const catalog = await loadFriskyCatalog(req);
      const matches = catalog.filter((item) => matchesQuery(item, words));
      const clean = cleanupDataAndSortPart({count: matches.length, items: matches});
      const page = clean.items.slice(offset, offset + count);
      response = {
        ...formatPlaylist({count: matches.length, items: page}, offset),
        total: matches.length
      };
    } else {
      response = await getPlaylistData(req, owner, count, offset);
    }

    // the heart in the list comes straight from here: a track is a favourite
    // when a copy of it sits in the user's Frisky-favorites playlist
    const {byKey} = await loadFavoritesIndex(req);
    if (byKey.size > 0) {
      response.items = response.items.map((item) => ({
        ...item,
        favorite: byKey.has(favoriteKey(item))
      }));
    }

    res.status(200).send(response);
  } catch (error: Error | any) {
    const errorMessage = error.message || error.error_msg || '';
    
    // VK IP address error means token needs refresh - return 403
    if (errorMessage.includes('access_token was given to another ip address') || 
        errorMessage.includes('User authorization failed')) {
      console.error("VK IP address error - token needs refresh:", errorMessage);
      res.status(403).send({errMessage: errorMessage});
      return;
    }
    
    res.status(500).send({errMessage: errorMessage});
  }
});

/**
 * Helper function to populate Frisky-favorites playlist with feelin_frisky tracks
 */
const populateFriskyFavorites = async (req: Request, playlistId: number) => {
  // Get all user's favorites to find feelin_frisky tracks
  const userFavorites = await vkMethod(req, "audio.get", {
    owner_id: req.session.user_id,
    count: 6000, // VK max
    offset: 0
  }, false);

  const favoritesResponse = userFavorites.response as VkPlaylistResponse;
  
  // Filter tracks with "feelin_frisky" in title or artist (case-insensitive)
  const friskyTracks = favoritesResponse.items.filter((track: any) => {
    const searchStr = `${track.artist} ${track.title}`.toLowerCase();
    return searchStr.includes("feelin_frisky") || searchStr.includes("feelin frisky");
  });

  // Sort by date (oldest first)
  friskyTracks.sort((a: any, b: any) => (a.date || 0) - (b.date || 0));

  // Add tracks to Frisky-favorites playlist
  const addedTracks: number[] = [];
  for (const track of friskyTracks) {
    try {
      await vkMethod(req, "audio.add", {
        audio_id: track.id,
        owner_id: track.owner_id,
        album_id: playlistId
      }, false);
      addedTracks.push(track.id);
    } catch (error) {
      console.error(`Failed to add track ${track.id} to playlist:`, error);
    }
  }

  return {
    tracksAdded: addedTracks.length,
    totalFriskyTracks: friskyTracks.length
  };
}

/**
 * Create Frisky-favorites playlist and populate with feelin_frisky tracks
 * POST /api/playlist/frisky/create-favorites
 */
api.post("/frisky/create-favorites", checkAuthAndroid, async (req: Request, res: Response) => {
  try {
    // Check if Frisky-favorites already exists
    let playlistId = await getFriskyFavoritesPlaylistId(req);
    
    if (playlistId) {
      res.status(409).send({
        error: "Playlist already exists",
        message: "Frisky-favorites playlist already exists. Use PATCH to recreate it.",
        playlistId
      });
      return;
    }

    // Create new playlist
    playlistId = await createFriskyFavoritesPlaylist(req);

    // Populate playlist with feelin_frisky tracks
    const populateResult = await populateFriskyFavorites(req, playlistId);
    invalidateFavoritesIndex(req);

    res.status(201).send({
      status: "created",
      message: "Frisky-favorites playlist created and populated",
      playlistId,
      ...populateResult
    });

  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * Recreate Frisky-favorites playlist (delete all tracks and repopulate)
 * PATCH /api/playlist/frisky/create-favorites
 */
api.patch("/frisky/create-favorites", checkAuthAndroid, async (req: Request, res: Response) => {
  try {
    // Check if Frisky-favorites exists
    const playlistId = await getFriskyFavoritesPlaylistId(req);
    
    if (!playlistId) {
      res.status(404).send({
        error: "Playlist not found",
        message: "Frisky-favorites playlist does not exist. Use POST to create it."
      });
      return;
    }

    // Get current tracks in the playlist
    const currentTracks = await vkMethod(req, "audio.get", {
      owner_id: req.session.user_id,
      album_id: playlistId,
      count: 6000,
      offset: 0
    }, false);

    const tracksResponse = currentTracks.response as VkPlaylistResponse;
    
    // Delete all tracks from the playlist
    let deletedCount = 0;
    for (const track of tracksResponse.items) {
      try {
        await vkMethod(req, "audio.delete", {
          audio_id: track.id,
          owner_id: track.owner_id
        }, false);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete track ${track.id}:`, error);
      }
    }

    // Repopulate playlist with feelin_frisky tracks
    const populateResult = await populateFriskyFavorites(req, playlistId);
    invalidateFavoritesIndex(req);

    res.status(200).send({
      status: "recreated",
      message: "Frisky-favorites playlist recreated",
      playlistId,
      deletedTracks: deletedCount,
      ...populateResult
    });

  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * The user's playlists, for the picker on the Favorites tab.
 * GET /api/playlist/frisky/playlists
 *
 * `Frisky-favorites` is flagged so the app can mark it as the default without
 * matching on the title itself. It is absent from the list until the first
 * track is hearted — that is when it gets created.
 */
api.get("/frisky/playlists", checkAuthAndroid, async (req: Request, res: Response) => {
  try {
    const response = await vkMethod(req, "audio.getPlaylists", {
      owner_id: req.session.user_id,
      count: 100
    }, false);

    const items = ((response.response as any)?.items ?? []) as Array<{
      id: number;
      title?: string;
      count?: number;
    }>;

    res.status(200).send({
      count: items.length,
      items: items.map((playlist) => ({
        id: playlist.id,
        title: playlist.title ?? "",
        count: playlist.count ?? 0,
        is_frisky: playlist.title?.trim().toLowerCase() === FRISKY_FAVORITES_PLAYLIST_TITLE.toLowerCase()
      }))
    });
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});



/**
 * The same index over an ARBITRARY list: a playlist of the user's, or their
 * whole library when `playlistId` is null. Used to find the user's own copy of
 * a track before removing it, and to light the hearts in the suggestions.
 * Never cached — a delete must see the list as it is now.
 */
const loadPlaylistIndex = async (
  req: Request,
  playlistId: number | null,
): Promise<Map<string, FavoriteEntry>> => {
  const byKey = new Map<string, FavoriteEntry>();
  try {
    const response = await vkMethod(req, "audio.get", {
      owner_id: req.session.user_id,
      ...(playlistId !== null ? {playlist_id: playlistId} : {}),
      count: 6000,
      offset: 0
    }, false);
    const list = response.response as VkPlaylistResponse;
    const clean = cleanupData({count: list?.count ?? 0, items: list?.items ?? []});
    for (const item of clean.items) {
      byKey.set(favoriteKey(item), {id: item.id, owner_id: item.owner_id});
    }
  } catch (error) {
    console.error("Error loading a playlist index:", error);
  }
  return byKey;
}

/**
 * Which list a heart writes to.
 *
 * The Favorites tab hearts whatever it is showing: the selected playlist, or —
 * with "All" — the VK library itself, with no playlist involved. Everywhere
 * else (the Songs tab, the player) there is no selection and it is
 * Frisky-favorites, created on demand.
 */
const resolveTarget = async (
  req: Request,
  // a JSON body sends a playlist id as a NUMBER, a query string as text
  requested: string | number | undefined | null,
  create: boolean,
): Promise<{ library: boolean; playlistId: number | null }> => {
  const value = requested === undefined || requested === null ? undefined : String(requested).trim();
  if (value?.toLowerCase() === "all") return {library: true, playlistId: null};

  const explicit = value ? parseInt(value) : NaN;
  if (Number.isFinite(explicit)) return {library: false, playlistId: explicit};

  const frisky = create
    ? await ensureFriskyFavoritesPlaylistId(req)
    : await getFriskyFavoritesPlaylistId(req);
  return {library: false, playlistId: frisky};
}

/**
 * VK-wide audio search — the "Suggested for you" section of the Favorites tab.
 * Tracks the user already has are flagged against `byKey`, so a heart is never
 * shown empty for something that is already theirs.
 */
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runVkSearch = async (req: Request, query: string, count: number) => {
  // NOT url-encoded. `vkMethod` signs the url it builds, and VK verifies the sig
  // against the DECODED parameters — so a query encoded here ("moby%20heart")
  // is signed as one thing and checked as another, and VK answers
  // "sig param is incorrect". That is why every multi-word search came back
  // empty while single words worked. The characters that would break the query
  // string are dropped instead.
  const response = await vkMethod(req, "audio.search", {
    q: query.replace(/[&=#?]/g, " ").trim(),
    count,
    auto_complete: 1
  }, false);
  const found = response.response as VkPlaylistResponse;
  return cleanupData({count: found?.count ?? 0, items: found?.items ?? []}).items;
}

const searchVkAudio = async (
  req: Request,
  words: string[],
  count: number,
  byKey: Map<string, FavoriteEntry>,
) => {
  const query = words.join(" ");
  try {
    let items = await runVkSearch(req, query, count);

    // VK matches the query as ONE phrase: "moby heart" finds nothing even though
    // "Moby — In My Heart" exists. So when the phrase comes back empty, search
    // each word on its own and keep the tracks that contain them ALL — which is
    // what a full-text search is expected to do.
    if (items.length === 0 && words.length > 1) {
      const seen = new Set<string>();
      const merged: VkPlaylistResponse["items"] = [];
      for (const word of words) {
        await pause(350);
        const wide = await runVkSearch(req, word, Math.min(count * 3, 300));
        for (const item of wide) {
          const id = `${item.owner_id}_${item.id}`;
          if (seen.has(id) || !matchesQuery(item, words)) continue;
          seen.add(id);
          merged.push(item);
        }
        if (merged.length >= count) break;
      }
      items = merged.slice(0, count);
    }

    const formatted = formatPlaylist({count: items.length, items}, 0);
    return formatted.items.map((item) => ({...item, favorite: byKey.has(favoriteKey(item))}));
  } catch (error) {
    console.error("VK audio search failed:", error);
    return [];
  }
}

/**
 * Get Frisky favorites
 * GET /api/playlist/frisky/favorites
 */
api.get("/frisky/favorites", checkAuthAndroid, async (req: Request, res: Response) => {
  try {
    const count: number = parseInt(req.query?.count as string) || 100;
    const offset: number = parseInt(req.query.offset as string) || 0;
    const requested = (req.query.playlist_id as string | undefined)?.trim();

    // `all` = the user's whole VK audio library, no playlist filter
    const wantsEverything = requested?.toLowerCase() === "all";
    // an explicit playlist wins; otherwise it is Frisky-favorites
    const explicitPlaylistId = requested && !wantsEverything ? parseInt(requested) : NaN;

    // resolved ONCE: VK allows 3 calls a second, and this handler already spends
    // two or three of them
    const friskyId = await getFriskyFavoritesPlaylistId(req);

    let playlistId: number | null = null;
    if (!wantsEverything) {
      playlistId = Number.isFinite(explicitPlaylistId) ? explicitPlaylistId : friskyId;

      // NOT created here: the playlist is born when the first track is hearted
      // (see PUT). Until then the tab is simply empty.
      if (playlistId === null) {
        res.status(200).send({count: 0, offset, total: 0, items: []} as Tracklist);
        return;
      }
    }

    const words = queryWords((req.query.q as string) ?? "");
    const searching = words.length > 0;

    // a search reads the WHOLE list and filters here; VK cannot search inside a
    // playlist, and filtering only the visible page would miss almost everything
    const response = await vkMethod(req, "audio.get", {
      owner_id: req.session.user_id,
      ...(playlistId !== null ? {playlist_id: playlistId} : {}),
      count: searching ? 6000 : count,
      offset: searching ? 0 : offset
    }, false);

    const playlistResponse = response.response as VkPlaylistResponse;
    // NO part-sorting here: VK returns a library and a playlist in the order
    // things were ADDED (newest first), and that is the order this tab wants.
    // Grouping "Part 2" next to its "Part 1" would move an old track to the top.
    const clean = cleanupData(playlistResponse);
    if (searching) {
      clean.items = clean.items.filter((item) => matchesQuery(item, words));
      clean.count = clean.items.length;
      clean.items = clean.items.slice(0, count);
    }
    const formatted = formatPlaylist(clean, offset);
    if (searching) formatted.total = clean.count;

    // Every row of this tab is, by construction, in the list the heart writes to
    // — the selected playlist, or the library itself under "All".
    formatted.items = formatted.items.map((item) => ({...item, favorite: true}));

    // "All" + a query also searches the rest of VK, below a divider the app
    // draws: the user's own audio first, everything else after it
    if (searching && wantsEverything) {
      // The library is what "All" hearts write to, so that is what lights them —
      // and it was ALREADY fetched above (a search reads the whole list), so
      // indexing it here costs nothing. Fetching it again cost a VK call and,
      // with the searches below, ran into "too many requests per second".
      const libraryKeys = new Map<string, FavoriteEntry>();
      for (const item of cleanupData(playlistResponse).items) {
        libraryKeys.set(favoriteKey(item), {id: item.id, owner_id: item.owner_id});
      }
      const globalItems = await searchVkAudio(req, words, count, libraryKeys);
      res.status(200).send({...formatted, global: globalItems});
      return;
    }

    res.status(200).send(formatted);
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * Add a track to the favourites of the SELECTED list.
 * PUT /api/playlist/frisky/favorites?playlist_id=<id|all>
 *
 * No `playlist_id` means Frisky-favorites, created here if the user has none —
 * that is the playlist the Songs tab and the player write to. `all` adds to the
 * VK library and to no playlist.
 */
api.put("/frisky/favorites", checkAuthAndroid, async (req: Request, res: Response) => {
  try {
    const requested = (req.body.playlist_id ?? req.query.playlist_id) as string | undefined;
    const target = await resolveTarget(req, requested, true);

    const audioId = req.body.audio_id || req.query.audio_id;
    const ownerId = req.body.owner_id || req.query.owner_id || FRISKY_OWNER_ID;

    if (!audioId) {
      res.status(400).send({errMessage: "audio_id is required"});
      return;
    }

    // audio.add COPIES the track into the user's library under a new id; with an
    // album_id the copy also lands in that playlist
    const added = await vkMethod(req, "audio.add", {
      audio_id: audioId,
      owner_id: ownerId,
      ...(target.playlistId !== null ? {album_id: target.playlistId} : {})
    }, false);

    const copyId = (added.response as any)?.id ?? (added.response as any) ?? null;
    invalidateFavoritesIndex(req);

    res.status(200).send({
      status: "added",
      message: target.library
        ? "Track added to your VK audio"
        : "Track added to the playlist",
      audio_id: audioId,
      playlist_id: target.playlistId,
      copy_id: copyId
    });

  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * Remove a track from the favourites of the SELECTED list.
 * DELETE /api/playlist/frisky/favorites/:id?playlist_id=<id|all>
 *
 * `:id` is the track AS THE APP KNOWS IT. `audio.add` copies a track into the
 * library under a NEW id, so the user's own copy is resolved through the
 * artist|title index first — deleting the id the app holds would address a track
 * that does not exist (or somebody else's). Nothing is removed when the
 * resolution fails.
 *
 * Removing from a playlist does NOT delete the library copy: the track may be
 * in other playlists, and `audio.delete` would take it out of all of them. With
 * `all` there is no playlist to leave, so the copy itself goes.
 */
api.delete("/frisky/favorites/:id", checkAuthAndroid, async (req: Request, res: Response) => {
  try {
    const audioId = req.params.id;
    if (!audioId) {
      res.status(400).send({errMessage: "audio_id is required"});
      return;
    }

    const requested = req.query.playlist_id as string | undefined;
    const target = await resolveTarget(req, requested, false);

    if (!target.library && target.playlistId === null) {
      res.status(404).send({errMessage: "Frisky-favorites playlist not found"});
      return;
    }

    const byKey = await loadPlaylistIndex(req, target.playlistId);

    // artist/title of the track the app is pointing at
    const ownerId = (req.query.owner_id as string) || String(FRISKY_OWNER_ID);
    const source = await vkMethod(req, "audio.getById", {
      audios: `${ownerId}_${audioId}`
    }, false);
    const sourceItem = ((source.response as any) ?? [])[0];

    if (!sourceItem) {
      res.status(404).send({errMessage: `Track ${ownerId}_${audioId} not found`});
      return;
    }

    const cleanSource = cleanupData({count: 1, items: [sourceItem]}).items[0];
    const copy = byKey.get(favoriteKey(cleanSource));

    if (!copy) {
      // already gone — report success so the app can clear the heart
      res.status(200).send({
        status: "not_in_favorites",
        message: "Track is not in that list",
        audio_id: audioId
      });
      return;
    }

    if (target.library) {
      await vkMethod(req, "audio.delete", {
        audio_id: copy.id,
        owner_id: copy.owner_id
      }, false);
    } else {
      // `audio.delete` alone does NOT drop playlist membership: VK answers
      // response:1 and serves the track again on the next audio.get
      await vkMethod(req, "audio.removeFromPlaylist", {
        owner_id: req.session.user_id,
        playlist_id: target.playlistId,
        audio_ids: `${copy.owner_id}_${copy.id}`
      }, false);
    }
    invalidateFavoritesIndex(req);

    res.status(200).send({
      status: "deleted",
      message: target.library
        ? "Track removed from your VK audio"
        : "Track removed from the playlist",
      audio_id: audioId,
      playlist_id: target.playlistId,
      copy_id: copy.id
    });

  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});


/**
 * Get the any playlist
 * @unused
 */
api.get("/", checkAuthAndroid, async (req: Request, res: Response) => {

  const owner: number = parseInt(req.query.owner as string);
  const count: number = parseInt(req.query?.count as string) || 1;
  const offset: number = parseInt(req.query.offset as string) || 0;
  if (!req.query.owner) {
    res.status(400).send({errData: "No owner_id"});
    return;
  }
  try {
    //const playlistId = await checkFavoiteAndCreateIfNotExist(req, true)
    //const exec = await makeQuery(req.query, playlistId); // {count:${count},offset:${offset}, owner_id:-42311167}
    const response: Tracklist = await getPlaylistData(req, owner, count, offset);
    //const response: PlayListResponse = await method(req, 'execute',{code:exec}, true)
    res.status(200).send(response);
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * Get the any playlist
 * @unused
 */
api.put("/", checkAuthAndroid, async (req: Request, res: Response) => {

  const owner: number = parseInt(req.query.owner as string);
  const count: number = parseInt(req.query?.count as string) || 1;
  const offset: number = parseInt(req.query.offset as string) || 0;
  if (!req.query.owner) {
    res.status(400).send({errData: "No owner_id"});
    return;
  }
  try {
    //const playlistId = await checkFavoiteAndCreateIfNotExist(req, true)
    //const exec = await makeQuery(req.query, playlistId); // {count:${count},offset:${offset}, owner_id:-42311167}
    const response: Tracklist = await getPlaylistData(req, owner, count, offset);
    //const response: PlayListResponse = await method(req, 'execute',{code:exec}, true)
    res.status(200).send(response);
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});
/**
 * Get the any playlist
 * @unused
 */
api.delete("/", checkAuthAndroid, async (req: Request, res: Response) => {

  const owner: number = parseInt(req.query.owner as string);
  const count: number = parseInt(req.query?.count as string) || 1;
  const offset: number = parseInt(req.query.offset as string) || 0;
  if (!req.query.owner) {
    res.status(400).send({errData: "No owner_id"});
    return;
  }
  try {
    //const playlistId = await checkFavoiteAndCreateIfNotExist(req, true)
    //const exec = await makeQuery(req.query, playlistId); // {count:${count},offset:${offset}, owner_id:-42311167}
    const response: Tracklist = await getPlaylistData(req, owner, count, offset);
    //const response: PlayListResponse = await method(req, 'execute',{code:exec}, true)
    res.status(200).send(response);
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});




// TODO: TBD features methods
// Get song information by song id
api.get("/:user_id/:owner_id/:id", checkAuthAndroid, async (req: Request, res: Response) => {
  const refresh: boolean = Boolean(req.query?.refresh) || false;
  if (!req.params.owner_id || !req.params.id) {
    res.status(400).send({errData: "No owner_id or audio id"});
    return;
  }
  try {
    if (refresh) {
      res.status(200).send({status: "ok", message: "Refreshed"});
      return;
    }
    const response = await vkMethod(req, "audio.getById", {"audios": `${req.params.owner_id}_${req.params.id}`})
    res.status(200).send(response);

  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * add information to the song
 *
 * @param user_id - user id from profile information
 * @param owner_id - owner id of the song
 * @param id - song id
 * @returns
 * @example {
 * frisky_id:123456,
 * artwork: http://localhost/image.jpg,
 * playlist:[
 *   {time:"0:12", artist:"AwesomeArtist": title:"Title", spotify_id:"asdf123adf"},
 *   {time:"0:34", artist:"SomeAwesomeArtist": title:"SomeTitle", spotify_id:"123asdf123"}
 * ]
 * }
 **/
api.post("/:user_id/:owner_id/:id", checkAuthAndroid, async (req: Request, res: Response) => {
  const body = req.body
  if (!req.params.owner_id || !req.params.id) {
    res.status(400).send({errData: "No owner_id or audio id"});
    return;
  }
  try {
    const response = await vkMethod(req, "audio.getById", {"audios": `${req.params.owner_id}_${req.params.id}`})
    res.status(200).send(response);

  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * add timing information in to the song
 *
 * @param user_id - user id from profile information
 * @param owner_id - owner id of the song
 * @param id - song id
 * @returns
 * @example {time:"0:12", artist:"AwesomeArtist": title:"Title"}
 **/
api.put("/:user_id/:owner_id/:id", checkAuthAndroid, async (req: Request, res: Response) => {
  const body = req.body
  if (!req.params.owner_id || !req.params.id) {
    res.status(400).send({errData: "No owner_id or audio id"});
    return;
  }
  try {
    const response = await vkMethod(req, "audio.getById", {"audios": `${req.params.owner_id}_${req.params.id}`})
    res.status(200).send(response);

  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});





