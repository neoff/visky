/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthFragmentResponse } from '../models/AuthFragmentResponse';
import type { TokenRequest } from '../models/TokenRequest';
import type { VkResponse } from '../models/VkResponse';
import type { VkUserInfoResponse } from '../models/VkUserInfoResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * Create new auth token with data from /auth/blank.html
     * Create user token.
     * @returns AuthFragmentResponse Return auth token
     * @throws ApiError
     */
    public static createAuthToken({
        requestBody,
    }: {
        requestBody: TokenRequest,
    }): CancelablePromise<AuthFragmentResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/token',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Set data to session and refresh existing token
     * Set data to session.
     * @returns void
     * @throws ApiError
     */
    public static setAuthDataToSession({
        requestBody,
    }: {
        requestBody: TokenRequest,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/refresh',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                301: `Redirect to ehe /auth/refresh`,
                400: `Bad Request`,
            },
        });
    }
    /**
     * get data from session and refresh auth token
     * Refresh existing token.
     * @returns AuthFragmentResponse Return auth token
     * @throws ApiError
     */
    public static refreshAuthToken(): CancelablePromise<AuthFragmentResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/auth/refresh',
            errors: {
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Get user profile information like name, id, etc.
     * Get user profile.
     * @returns any OK
     * @throws ApiError
     */
    public static getUserProfile(): CancelablePromise<(VkResponse & {
        response?: VkUserInfoResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/auth/profile',
        });
    }
}
