import * as dotenv from "dotenv";
import { normalizePort } from "@/helper";
import passport from 'passport'

dotenv.config();
export const PORT: number = normalizePort(process.env.PORT || '3000');

export const vkTokenAncor = process.env.DEV_API_TOKEN

// Serialize user into the sessions
passport.serializeUser((user: any, done) => { // happens after user is inserted into DB
    return done(null, user.id)
})
