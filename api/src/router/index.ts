// src/router/index.ts
import app from "@/configurations/router";
import {api} from "@/router/api/playlist";
import {auth} from "@/router/api/auth";
import {player} from "@/router/api/player";
import {authForm} from "@/router/authForm";
import {notFoundHandler} from "@/router/middleware/not-found.middleware";
import {errorHandler} from "@/router/middleware/error.middleware";

// APP
app.use("/auth", authForm);
app.use("/api/auth", auth);
app.use("/api/oauth", auth);
app.use("/api/playlist", api);
app.use("/api/player", player);

// ERROR
app.use(notFoundHandler);
// ERROR RESPONSE
app.use(errorHandler);

export default app;