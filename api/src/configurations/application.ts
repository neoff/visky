import express from "express";
import cors from "cors";
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { errorHandler } from "@/middleware/error.middleware";
import { notFoundHandler } from "@/middleware/not-found.middleware";

const app = express();

/**
*  App Configuration
*/
app.use(cors());
app.use(express.json());
// User session support middlewares. Your exact suite might vary depending on your app's needs.
app.use(cookieParser('keyboard cat'));
app.use(require('body-parser').urlencoded({extended: true}));
app.use(session({
    //idleTime: 10 * 1000 * 60, // 10 minutes
    secret:'keyboard cat', 
    // genid: function(req) {
    //   return genuuid() // use UUIDs for session IDs
    // },
    resave: true, 
    saveUninitialized: true,
    cookie: {
        maxAge: 60000 * 60 * 24 * 7, // 1 week
        //secure: true,
        //httpOnly: true,
        //sameSite: true,
        signed: true
    },
}));


// ERROR
app.use(notFoundHandler);
// ERROR RESPONSE
app.use(errorHandler);

export default app;