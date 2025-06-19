// src/configurations/application.ts
import express from "express";
import cookieParser from 'cookie-parser';
import session from 'express-session';
import healthRoute from "@/router/health/health";
import {setupSwagger} from "@/configurations/swagger";
import cors from "cors";

/**
 *  App Configuration
 */
const app = express();

app.use(cors());
// User session support middlewares. Your exact suite might vary depending on your app's needs.
app.use(cookieParser('keyboard cat'));
app.use(require('body-parser').urlencoded({extended: true}));
app.use(session({
  secret: 'keyboard cat',
  resave: true,
  saveUninitialized: true,
  cookie: {
    maxAge: 60000 * 60 * 24 * 7, // 1 week
    signed: true
  },
}));
// HEALTH CHECK
healthRoute(app)
//SWAGGER
setupSwagger(app);

app.use(express.json());
export default app;