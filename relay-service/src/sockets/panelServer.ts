import type { Server } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { relayToPanelSchema } from "@automation/shared";
import type { RelayToPanel } from "@automation/shared";
import { verifyInternalSecret } from "../auth";

let panel: ReturnType<SocketIOServer["of"]> | null = null;

export function attachPanelServer(server: Server): void {
  const io = new SocketIOServer(server, { path: "/socket.io" });
  const ns = io.of("/panel");
  ns.use((socket, next) => {
    const header = socket.handshake.headers["x-internal-secret"];
    const secret = Array.isArray(header) ? header[0] : header;
    if (verifyInternalSecret(secret ?? null)) {
      next();
    } else {
      next(new Error("Unauthorized"));
    }
  });
  ns.on("connection", () => {
    console.log("[panel] client connected");
  });
  panel = ns;
}

export function broadcastPanel(msg: RelayToPanel): void {
  const parsed = relayToPanelSchema.safeParse(msg);
  if (!parsed.success || !panel) return;
  panel.emit("message", parsed.data);
}
