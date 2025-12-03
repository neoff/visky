// src/configurations/application.ts
import express from "express";
import cookieParser from 'cookie-parser';
import session from 'express-session';
import healthRoute from "@/router/health";
import setupSwagger from "@/router/swagger";
import cors from "cors";
import path from "path";

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

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../../public')));

// HEALTH CHECK
healthRoute(app)
//SWAGGER
setupSwagger(app);

app.use(express.json());
export default app;