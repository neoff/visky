/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TrackContent } from './TrackContent';
/**
 * Track item
 */
export type TrackItem = {
    id: number;
    owner_id: number;
    type: TrackItem.type;
    url: string;
    artwork?: string;
    title: string;
    artist: string;
    date: number;
    duration: number;
    favorite?: boolean;
    hidden?: boolean;
    genre_list?: Array<{
        id?: number;
        name?: string;
    }>;
    track_list?: Array<TrackContent>;
    multipart?: boolean;
    part_list?: Array<{
        url?: string;
        part?: number;
        duration?: number;
    }>;
};
export namespace TrackItem {
    export enum type {
        DEFAULT = 'default',
        DASH = 'dash',
        HLS = 'hls',
        SMOOTHSTREAMING = 'smoothstreaming',
    }
}

