// src/router/index.ts
import app from "@/configurations/router";
import {api} from "@/router/api/playlist";
import {auth} from "@/router/api/auth";
import {pair} from "@/router/api/pair";
import {player} from "@/router/api/player";
import {reports} from "@/router/api/reports";
import {version} from "@/router/api/version";
import {authForm} from "@/router/authForm";
import {errorHandler} from "@/router/middleware/error.middleware";
import webRouter from "@/router/web";

// WEB PAGES (Landing, EULA, Downloads)
app.use("/", webRouter);

// APP
app.use("/auth", authForm);
app.use("/api/auth", auth);
app.use("/api/oauth", auth);
app.use("/api/playlist", api);
app.use("/api/player", player);
// The website's two forms, and the dashboard that lists what they produced.
app.use("/api", reports);
// What the current release is, so a client can tell it is behind one.
app.use("/api/version", version);
// Handing a phone session to a screen that cannot log in on its own.
app.use("/api/pair", pair);

// ERROR RESPONSE
app.use(errorHandler);

export default app;