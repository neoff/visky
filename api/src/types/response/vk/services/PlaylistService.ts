/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Tracklist } from '../models/Tracklist';
import type { VkPlaylistResponse } from '../models/VkPlaylistResponse';
import type { VkResponse } from '../models/VkResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class PlaylistService {
    /**
     * Get list of tracks from `Frisky radio` group playlist.
     * Get tracks from `Frisky radio` group.
     * @returns Tracklist OK
     * @throws ApiError
     */
    public static getFriskyRadio(): CancelablePromise<Tracklist> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/playlist/frisky',
        });
    }
    /**
     * Get list of tracks from frisky-favorites playlist.
     * Get frisky-favorites playlist.
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
     * Get list of tracks from custom playlist by existing playlist ID
     * Get list of tracks from custom playlist.
     * @returns any OK
     * @throws ApiError
     */
    public static getPlaylistTracks(): CancelablePromise<(VkResponse & {
        response?: VkPlaylistResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/playlist/',
        });
    }
}
