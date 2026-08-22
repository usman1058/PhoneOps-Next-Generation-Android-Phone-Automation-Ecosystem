import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { agentToRelaySchema } from "@automation/shared";
import { verifyInternalSecret } from "../auth";
import {
  getPcSessionOwner,
  registerAgent,
  removeAgent,
} from "../agents";
import { sendToDevice } from "./state";

const wss = new WebSocketServer({ noServer: true });

export function attachAgentServer(server: Server): void {
  server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/agent") return;

    // Agents authenticate with the shared internal secret so random LAN
    // clients cannot stream screens into the relay.
    const secret = req.headers["x-internal-secret"];
    if (!verifyInternalSecret(Array.isArray(secret) ? secret[0] : (secret ?? null))) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    let agentId: string | null = null;
    let helloed = false;

    const killTimer = setTimeout(() => {
      if (!helloed) ws.close(4401, "Unauthorized");
    }, 5000);

    ws.on("message", (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.close(4400, "Bad message");
        return;
      }
      const parsed = agentToRelaySchema.safeParse(msg);
      if (!parsed.success) return;
      const m = parsed.data;

      if (m.type === "hello_agent") {
        helloed = true;
        clearTimeout(killTimer);
        agentId = registerAgent(ws, m.name);
        console.log(`[agent] registered "${m.name}" as ${agentId}`);
        return;
      }

      if (!helloed || !agentId) return;

      if (m.type === "pc_frame") {
        // Frames only flow to the phone that owns this viewing session.
        const owner = getPcSessionOwner(agentId);
        if (!owner) return; // nobody watching -> drop the frame
        sendToDevice(owner, {
          type: "pc_frame",
          agentId,
          w: m.w,
          h: m.h,
          data: m.data,
        });
      }
    });

    ws.on("close", () => {
      clearTimeout(killTimer);
      if (agentId) {
        console.log(`[agent] ${agentId} disconnected`);
        removeAgent(agentId);
      }
    });
  });
}
