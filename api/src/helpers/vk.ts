import { Request, Response } from "@/types";
import express, { NextFunction } from "express";
import { AndroidClient, TokenUrl, AuthUrl, encodeQueryData, deviceIDgen, md5 } from ".";
import { version } from "@/constants";
import { error } from "console";
import {AxiosError} from "axios";


export const checkAuthAndroid = async(req: Request, res: Response, next: NextFunction) => {
    console.log("===================checkAuthAndroid:",req.session)
    if ((!req.session || !req.session.access_token || !req.session.user_id) 
        && (!req.headers['x-auth-token'])) {
        console.error("ERROR! checkAuth: No token or secret", req.session)
        res.status(403).send(new AxiosError("No token or secret"));
        return;
    }
    next();
}

/**
 * call method from VK API
 * @param req
 * @param method
 * @param params
 * @param sign
 */
//=================== HELPER METHOD!!!!!! ======================
export const method = async (req: Request, method: string, params : {}, sign: boolean = false): Promise<any> => {
    let url =`/method/${method}?v=${version}&access_token=${req.session.access_token}`
    for (const [key, value] of Object.entries(params)) {
        url+=`&${key}=${value}`
    }
    if(req.session.secret !== undefined && (req.session.secret !== null || req.session.secret !== "")) {
        //url+=`&client_secret=${req.session.secret}&device_id=${req.session.device_id}`
        url+=`&device_id=${req.session.device_id}`
        const hash = md5(url+req.session.secret)
        url+=`&sig=${hash}`
    }
    //console.debug(`======== /method/${method} with params ${params}`)
    //console.debug('================================url https://api.vk.com'+url)

    return await AndroidClient.get(`https://api.vk.com${url}`).then((response) => {
        console.debug(`======== /method/${method} RESPONSE:`, JSON.stringify(response.data, null, 2))
        return response.data?.response || response.data;
    })
    .catch((error) => {
        console.error(`======== /method/${method} ERROR:`, error)
        throw new Error(error.error_msg)
    })
}

//TODO: multiquery for different methods
export const makeQuery = async(query: any, playlistId:string): Promise<string> => {
    const count = query.count || 1;
    const playlistCount = query.playlistCount || 1;
    const favoritesCount = query.favoritesCount || 1;
    const offset = query.offset || 0;
    const playlistOffset = query.playlistOffset || 0;
    const favoritesOffset = query.favoritesOffset || 0;
    const exexData: string = `{
        frisky: API.audio.get({count:${count},offset:${offset}, owner_id:-42311167}),
        favorite: API.audio.get({owner_id:API.users.get()[0].id, playlist_id:${playlistId},count:${favoritesCount},offset:${favoritesOffset}}),
        playlist: API.audio.get({owner_id:API.users.get()[0].id, count:${playlistCount},offset:${playlistOffset}})
    }`
    return `return ${exexData.replace(/\s+|\s+/g, '')};`
}

//make simple query only frisky playlist
export const makeSimpleQuery = async(req: Request, sign: boolean = false) => {
    const count = req.query.count || 1;
    const offset = req.query.offset || 0;
    const exexData: string = `"audio.get"{
        frisky: API.audio.get({count:${count},offset:${offset}, owner_id:-42311167})
    }`
    return `return ${exexData.replace(/\s+|\s+/g, '')};`
}

 export const checkFavoriteAndCreateIfNotExist = async(req: Request, sign: boolean = false) => {
    let favorite = await method(req, 'audio.searchPlaylists',{q:"Frisky-favorites",count:1}, sign)
    if(favorite.response.count === 0) {
        const createFavorite =  await method(req, 'audio.createPlaylist',{title:"Frisky-favorites",owner_id:req.session.user_id}, sign)
        favorite.response.items.push(createFavorite.response)
    }
    return favorite.response.items[0].id
}
//==================///= HELPER METHOD!!!!!! ======================
