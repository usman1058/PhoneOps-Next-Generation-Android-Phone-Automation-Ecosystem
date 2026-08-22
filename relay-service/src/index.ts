import express from "express";
import http from "node:http";
import { config } from "./config";
import { initSentry } from "./sentry";
import { attachDeviceServer } from "./sockets/deviceServer";
import { attachPanelServer } from "./sockets/panelServer";
import { attachAgentServer } from "./sockets/agentServer";
import { internalRouter } from "./internal-api/router";
import { deviceAuthRouter } from "./device-auth";
import { initScheduler } from "./scheduler";
import { reconcileRunningRuns } from "./run";
import { startLanDiscovery, lanUrls } from "./lan-discovery";

initSentry();

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});
app.use("/device-auth", deviceAuthRouter);
app.use("/internal", internalRouter);

const server = http.createServer(app);

attachDeviceServer(server);
attachPanelServer(server);
attachAgentServer(server);

server.listen(config.port, () => {
  console.log(`[relay] listening on :${config.port}`);
  reconcileRunningRuns().catch((err) =>
    console.error("[relay] run reconciliation failed", err),
  );
  initScheduler();
});

const discoverySocket = startLanDiscovery();
console.log(`[relay] lan urls: ${lanUrls().join(", ") || "(none)"}`);

function shutdown(): void {
  console.log("[relay] shutting down");
  discoverySocket.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
