// src/configurations/application.ts
import express from "express";
import cookieParser from 'cookie-parser';
import session from 'express-session';
import healthRoute from "@/router/health";
import setupSwagger from "@/router/swagger";
import cors from "cors";

/**
 *  App Configuration
 */
const app = express();

// CORS configuration for cookie support
app.use(cors({
  origin: true, // Allow all origins (or specify exact origins in production)
  credentials: true, // Allow cookies to be sent
}));
// User session support middlewares. Your exact suite might vary depending on your app's needs.
app.use(cookieParser('keyboard cat'));
app.use(require('body-parser').urlencoded({extended: true}));
app.use(session({
  secret: 'keyboard cat',
  resave: true,
  saveUninitialized: false, // Don't create session until something is stored
  cookie: {
    maxAge: 60000 * 60 * 24 * 7, // 1 week
    signed: true,
    httpOnly: true,
    sameSite: 'lax', // Allow cross-origin with GET requests
  },
}));

// HEALTH CHECK
healthRoute(app)
//SWAGGER
setupSwagger(app);

app.use(express.json());
export default app;