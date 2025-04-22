import express, { Express, Request as ExpressRequest, Response as ExpressResponse} from "express";
import { Session } from "express-session";

export type Request = ExpressRequest & { session: Session & AuthFragments }
export type Response = ExpressResponse

type AuthFragments = {
    access_token?: string
    secret?: string
    user_id?: string
    device_id?: string
    [key: string]: any
};

type Auth = {
    access_token?: string
    secret?: string
    device_id?: string
    user_id?: string
    [key: string]: any;
};

export type Playlist = {
    count: number
    offset: number
    total: number
    items: Item[]
}
export type Item = {
    artist: string
    id: number
    type: string
    owner_id: number
    title: string
    duration: number
    access_key: string
    ads: ItemAds
    is_explicit: boolean
    is_focus_track: boolean
    is_licensed: boolean
    track_code: string
    url: string
    date: number
    genre_id: number
    album?: Album
    is_hq?: boolean
    short_videos_allowed: boolean
    stories_allowed: boolean
    stories_cover_allowed: boolean
}

type ItemAds = {
    content_id: string
    duration: string
    account_age_type: string
    puid1: string
    puid22: string
}

type Album = {
    id: number
    title: string
    owner_id: number
    access_key: string
    thumb: Thumb
    main_color: string
}

type Thumb = {
    width: number
    height: number
    id: string
    photo_34: string
    photo_68: string
    photo_135: string
    photo_270: string
    photo_300: string
    photo_600: string
    photo_1200: string
}