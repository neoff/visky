// src/index.ts
import { AddressInfo } from "net";
import { PORT } from "@/configurations";
import app from "@/router";
//export * from "./helpers/strategies";


const server = app.listen(PORT, () => {
  const { address, port } = server.address() as AddressInfo;
  const ip = address === '::' || address === '::1' ? '127.0.0.1' : address;
  console.log(`Listening at http://${ip}:${port}`)
});