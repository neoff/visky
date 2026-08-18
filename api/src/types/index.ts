import express, { Express, Request as ExpressRequest, Response as ExpressResponse} from "express";
import { Session } from "express-session";
import {AuthFragmentSession} from "@/__genedated__/openapi/vk";

export type Request = ExpressRequest & { session: Session & AuthFragments }
export type Response = ExpressResponse & AuthFragments

type AuthFragments = AuthFragmentSession & { [key: string]: any };
