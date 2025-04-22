import app from "@/configurations/application";
import { api } from "@/controllers/playlist";
import { auth } from "@/controllers/auth";
import { player } from "@/controllers/player";

// APP
app.options('*', (req, res) => res.send());
app.use("/api/auth", auth);
app.use("/api/oauth", auth);
app.use("/api/playlist", api);
app.use("/api/player", player);