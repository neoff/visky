/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class TrackService {
    /**
     * NOT IMPLEMENTED YET Get song information by id.
     * NOT IMPLEMENTED YET.
     * @returns any OK
     * @throws ApiError
     */
    public static getTrackById({
        userId,
        ownerId,
        id,
    }: {
        /**
         * current user id
         */
        userId: number,
        /**
         * song owner id
         */
        ownerId: number,
        /**
         * track id
         */
        id: number,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/player/{user_id}/{owner_id}/{id}',
            path: {
                'user_id': userId,
                'owner_id': ownerId,
                'id': id,
            },
        });
    }
    /**
     * NOT IMPLEMENTED YET Add some information to the song (track list, timing, genres, etc.)
     * NOT IMPLEMENTED YET.
     * @returns any OK
     * @throws ApiError
     */
    public static addTrackInfo({
        userId,
        ownerId,
        id,
    }: {
        /**
         * current user id
         */
        userId: number,
        /**
         * song owner id
         */
        ownerId: number,
        /**
         * track id
         */
        id: number,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/player/{user_id}/{owner_id}/{id}',
            path: {
                'user_id': userId,
                'owner_id': ownerId,
                'id': id,
            },
        });
    }
    /**
     * NOT IMPLEMENTED YET Edit song information (track list, timing, genres, etc.)
     * NOT IMPLEMENTED YET.
     * @returns any OK
     * @throws ApiError
     */
    public static editTrackInfo({
        userId,
        ownerId,
        id,
    }: {
        /**
         * current user id
         */
        userId: number,
        /**
         * song owner id
         */
        ownerId: number,
        /**
         * track id
         */
        id: number,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/player/{user_id}/{owner_id}/{id}',
            path: {
                'user_id': userId,
                'owner_id': ownerId,
                'id': id,
            },
        });
    }
}
