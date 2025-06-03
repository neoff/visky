// configurations/application.ts
import express from "express";
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { errorHandler } from "@/middleware/error.middleware";
import { notFoundHandler } from "@/middleware/not-found.middleware";
import {getMetrics, register} from "@/configurations/metrics";
import {healthRoute} from "@/configurations/health";
import cors from "cors";

const app = express();

/**
*  App Configuration
*/
app.use(cors());
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
app.get('/actuator/health', healthRoute());
app.get('/actuator/prometheus', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await getMetrics());
});
// ERROR
app.use(notFoundHandler);
// ERROR RESPONSE
app.use(errorHandler);

app.use(express.json());
export default app;