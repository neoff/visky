// src/router/api/playlist.ts
import express from "express";
import {Request, Response} from "@/types";
import {checkAuthAndroid, vkMethod} from "@/helper/vk";
import {cleanupDataAndSortPart, formatPlaylist} from "@/helper";
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
 * Find or create Frisky-favorites playlist
 */
const getFriskyFavoritesPlaylistId = async (req: Request): Promise<number | null> => {
  try {
    const searchResult = await vkMethod(req, "audio.searchPlaylists", {
      q: FRISKY_FAVORITES_PLAYLIST_TITLE,
      count: 1
    }, false);
    
    if (searchResult.response && (searchResult.response as any).count > 0) {
      return (searchResult.response as any).items[0].id;
    }
    return null;
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
 * Get the frisky from the VK group  Frisky Radio
 */
api.get("/frisky", checkAuthAndroid, async (req: Request, res: Response) => {

  const owner: number = FRISKY_OWNER_ID;
  const count: number = parseInt(req.query?.count as string) || 1;
  const offset: number = parseInt(req.query.offset as string) || 0;
  try {
    const response: Tracklist = await getPlaylistData(req, owner, count, offset);
    res.status(200).send(response);
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
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
 * Get Frisky favorites
 * GET /api/playlist/frisky/favorites
 */
api.get("/frisky/favorites", checkAuthAndroid, async (req: Request, res: Response) => {
  try {
    const playlistId = await getFriskyFavoritesPlaylistId(req);
    
    if (!playlistId) {
      res.status(404).send({
        errMessage: "Frisky-favorites playlist not found. Use POST /api/playlist/frisky/create-favorites to create it."
      });
      return;
    }

    const count: number = parseInt(req.query?.count as string) || 100;
    const offset: number = parseInt(req.query.offset as string) || 0;

    const response = await vkMethod(req, "audio.get", {
      owner_id: req.session.user_id,
      playlist_id: playlistId,
      count,
      offset
    }, false);

    const playlistResponse = response.response as VkPlaylistResponse;
    const clean = cleanupDataAndSortPart(playlistResponse);
    const formatted = formatPlaylist(clean, offset);

    res.status(200).send(formatted);
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * Add track to Frisky favorites
 * PUT /api/playlist/frisky/favorites
 */
api.put("/frisky/favorites", checkAuthAndroid, async (req: Request, res: Response) => {
  try {
    const playlistId = await getFriskyFavoritesPlaylistId(req);
    
    if (!playlistId) {
      res.status(404).send({
        errMessage: "Frisky-favorites playlist not found. Use POST /api/playlist/frisky/create-favorites to create it."
      });
      return;
    }

    const audioId = req.body.audio_id || req.query.audio_id;
    const ownerId = req.body.owner_id || req.query.owner_id || FRISKY_OWNER_ID;

    if (!audioId) {
      res.status(400).send({errMessage: "audio_id is required"});
      return;
    }

    // Add to user's main favorites first
    await vkMethod(req, "audio.add", {
      audio_id: audioId,
      owner_id: ownerId
    }, false);

    // Then add to Frisky-favorites playlist
    await vkMethod(req, "audio.add", {
      audio_id: audioId,
      owner_id: ownerId,
      album_id: playlistId
    }, false);

    res.status(200).send({
      status: "added",
      message: "Track added to favorites and Frisky-favorites playlist",
      audio_id: audioId
    });

  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

/**
 * Delete track from Frisky favorites
 * DELETE /api/playlist/frisky/favorites/:id
 */
api.delete("/frisky/favorites/:id", checkAuthAndroid, async (req: Request, res: Response) => {
  try {
    const playlistId = await getFriskyFavoritesPlaylistId(req);
    
    if (!playlistId) {
      res.status(404).send({
        errMessage: "Frisky-favorites playlist not found. Use POST /api/playlist/frisky/create-favorites to create it."
      });
      return;
    }

    const audioId = req.params.id;
    const ownerId = req.query.owner_id as string || req.session.user_id?.toString() || "";

    if (!audioId) {
      res.status(400).send({errMessage: "audio_id is required"});
      return;
    }

    if (!ownerId) {
      res.status(400).send({errMessage: "owner_id is required or session user_id is missing"});
      return;
    }

    // Delete from user's library (this also removes from playlists)
    await vkMethod(req, "audio.delete", {
      audio_id: audioId,
      owner_id: ownerId
    }, false);

    res.status(200).send({
      status: "deleted",
      message: "Track deleted from favorites",
      audio_id: audioId
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





