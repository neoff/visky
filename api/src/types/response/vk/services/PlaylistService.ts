/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PlaylistResponse } from '../models/PlaylistResponse';
import type { Tracklist } from '../models/Tracklist';
import type { VkResponse } from '../models/VkResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class PlaylistService {
    /**
     * Get list of tracks from Frisky radio
     * @returns PlaylistResponse OK
     * @throws ApiError
     */
    public static getFriskyRadio(): CancelablePromise<PlaylistResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/playlist/frisky',
        });
    }
    /**
     * Get list of favorite tracks
     * @returns Tracklist OK
     * @throws ApiError
     */
    public static getFavorites(): CancelablePromise<Tracklist> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/playlist/favorites',
        });
    }
    /**
     * Get list of tracks from playlist
     * @returns any OK
     * @throws ApiError
     */
    public static getPlaylistTracks(): CancelablePromise<(VkResponse & {
        response?: PlaylistResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/playlist/',
        });
    }
}
