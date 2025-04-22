import express, {NextFunction} from "express";
import {Item, Playlist, Request, Response} from "@/types";
import {checkAuthAndroid, method} from "@/helpers/vk";
import {cleanupData} from "@/helpers";


export const api = express.Router();

const getPlaylistData =  async (req: Request, owner: number, count: number, offset: number): Promise<Playlist> => {
  return await method(req, "audio.get", {
    "count": count,
    "offset": offset,
    "owner_id": owner
  }, false)
    .then((data) => {
      console.log("===>>frisky data:", data);
      return cleanupData(data);
    });
}
/**
 * Get the frisky from the VK group  Frisky Radio
 */
api.get("/frisky", checkAuthAndroid, async (req: Request, res: Response) => {

  const owner: number = -42311167;
  const count: number = parseInt(req.query?.count as string) || 1;
  const offset: number = parseInt(req.query.offset as string) || 0;
  try {
    //const playlistId = await checkFavoiteAndCreateIfNotExist(req, true)
    //const exec = await makeQuery(req.query, playlistId); // {count:${count},offset:${offset}, owner_id:-42311167}
    const response: Playlist = await getPlaylistData(req, owner, count, offset);
    //const response: PlayListResponse = await method(req, 'execute',{code:exec}, true)
    res.status(200).send(response);
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

api.get("/playlist", checkAuthAndroid, async (req: Request, res: Response) => {

  const owner: number = parseInt(req.query.owner as string);
  const count: number = parseInt(req.query?.count as string) || 1;
  const offset: number = parseInt(req.query.offset as string) || 0;
  if (!req.query.owner) {
    return res.status(500).send({errData: "No owner_id"});
  }
  try {
    //const playlistId = await checkFavoiteAndCreateIfNotExist(req, true)
    //const exec = await makeQuery(req.query, playlistId); // {count:${count},offset:${offset}, owner_id:-42311167}
    const response: Playlist = await getPlaylistData(req, owner, count, offset);
    //const response: PlayListResponse = await method(req, 'execute',{code:exec}, true)
    res.status(200).send(response);
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});

// TODO: add song to the liked playlist
api.post("/playlist", checkAuthAndroid, async (req: Request, res: Response) => {
  const count: number = parseInt(req.query?.count as string) || 1;
  const offset: number = parseInt(req.query.offset as string) || 0;
  const owner: number = parseInt(req.query.owner as string) || -42311167;
  try {
    //const playlistId = await checkFavoiteAndCreateIfNotExist(req, true)
    //const exec = await makeQuery(req.query, playlistId); // {count:${count},offset:${offset}, owner_id:-42311167}
    const response: Playlist = await method(req, "audio.get", {
      "count": count,
      "offset": offset,
      "owner_id": owner
    }, false)
      .then((data) => {
        console.log("===>>frisky data:", data);
        return cleanupData(data);
      });
    //const response: PlayListResponse = await method(req, 'execute',{code:exec}, true)
    res.status(200).send(response);
  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
})







// TODO: TBD features methods
// Get song information by song id
api.get("/:user_id/:owner_id/:id", checkAuthAndroid, async (req: Request, res: Response) => {
  const refresh: boolean = Boolean(req.query?.refresh) || false;
  if (!req.params.owner_id || !req.params.id) {
    return res.status(500).send({errData: "No owner_id or audio id"});
  }
  try {
    if (refresh) {
      res.status(200).send({status: "ok", message: "Refreshed"});
      return;
    }
    const response = await method(req, "audio.getById", {"audios": `${req.params.owner_id}_${req.params.id}`})
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
api.post("/:user_id/:owner_id/:id", async (req: Request, res: Response) => {
  const body = req.body
  if (!req.params.owner_id || !req.params.id) {
    return res.status(500).send({errData: "No owner_id or audio id"});
  }
  try {
    const response = await method(req, "audio.getById", {"audios": `${req.params.owner_id}_${req.params.id}`})
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
    return res.status(500).send({errData: "No owner_id or audio id"});
  }
  try {
    const response = await method(req, "audio.getById", {"audios": `${req.params.owner_id}_${req.params.id}`})
    res.status(200).send(response);

  } catch (error: Error | any) {
    res.status(500).send({errMessage: error.message});
  }
});





