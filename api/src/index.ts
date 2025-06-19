import { AddressInfo } from "net";
import { PORT, ADDR } from "@/configurations";
import app from "@/configurations/application";
export * from "@/configurations/application";
export * from "@/configurations";
export * from "@/controllers";
//export * from "./helpers/strategies";

const server = app.listen(PORT, () => {
  const { address, port } = server.address() as AddressInfo;
  console.log(`Listening at http://${address}:${port}`)
});