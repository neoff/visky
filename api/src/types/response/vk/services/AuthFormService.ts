/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthFormService {
    /**
     * get VK auth page and remove defended scripts to fetch after auth token and secret
     *
     * @returns string OK
     * @throws ApiError
     */
    public static getVkAuthPage(): CancelablePromise<string> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/auth/vk',
        });
    }
    /**
     * get token and secret by login and password emulate old android app
     *
     * @returns void
     * @throws ApiError
     */
    public static authorizeAndGetAuthToken(): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/vk',
            errors: {
                301: `Redirect to ehe /auth/blank.html`,
                500: `Internal Server Error`,
            },
        });
    }
    /**
     * Redirect page for VK API auth
     * @returns string OK
     * @throws ApiError
     */
    public static blankAuthPage(): CancelablePromise<string> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/auth/blank.html',
        });
    }
}
