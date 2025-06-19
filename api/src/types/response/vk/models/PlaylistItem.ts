/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Song item in the playlist
 */
export type PlaylistItem = {
    artist?: string;
    id?: number;
    owner_id?: number;
    title?: string;
    duration?: number;
    access_key?: string;
    ads?: {
        content_id?: string;
        duration?: string;
        account_age_type?: string;
        puid1?: string;
        puid22?: string;
    };
    is_explicit?: boolean;
    is_focus_track?: boolean;
    is_licensed?: boolean;
    track_code?: string;
    url?: string;
    date?: number;
    genre_id?: number;
    short_videos_allowed?: boolean;
    stories_allowed?: boolean;
    stories_cover_allowed?: boolean;
    like?: boolean;
    content_restricted?: number;
    album?: {
        id?: number;
        title?: string;
        owner_id?: number;
        access_key?: string;
        thumb?: {
            width?: number;
            height?: number;
            id?: string;
            photo_34?: string;
            photo_68?: string;
            photo_135?: string;
            photo_270?: string;
            photo_300?: string;
            photo_600?: string;
            photo_1200?: string;
        };
        main_color?: string;
    };
    release_audio_id?: string;
};

