/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UserInfoResponse } from '../models/UserInfoResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * create new auth token with data from /auth/blank.html
     * @returns void
     * @throws ApiError
     */
    public static createAuthToken({
        requestBody,
    }: {
        requestBody: {
            vkurl?: string;
            secret?: string;
        },
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/token',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                301: `Redirect to ehe /auth/profile`,
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * get data from session and refresh auth token
     * @returns void
     * @throws ApiError
     */
    public static refreshAuthToken(): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/auth/refresh',
            errors: {
                301: `Redirect to ehe /auth/profile`,
            },
        });
    }
    /**
     * Set data to session
     * @returns void
     * @throws ApiError
     */
    public static setAuthDataToSession({
        requestBody,
    }: {
        requestBody: {
            access_token?: string;
            secret?: string;
        },
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/refresh',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                301: `Redirect to ehe /auth/refresh`,
            },
        });
    }
    /**
     * Get list of tracks
     * @returns UserInfoResponse OK
     * @throws ApiError
     */
    public static getUserProfile(): CancelablePromise<UserInfoResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/auth/profile',
        });
    }
}
