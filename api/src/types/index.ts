import express, { Express, Request as ExpressRequest, Response as ExpressResponse} from "express";
import { Session } from "express-session";
import {AuthFragmentSession} from "./response/vk";

export type Request = ExpressRequest & { session: Session & AuthFragments }
export type Response = ExpressResponse

type AuthFragments = AuthFragmentSession & { [key: string]: any };
