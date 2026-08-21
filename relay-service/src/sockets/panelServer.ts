import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { Server as SocketIOServer, type Socket } from "socket.io";
import {
  relayToPanelSchema,
  remoteInputSchema,
} from "@automation/shared";
import type { RelayToPanel } from "@automation/shared";
import { verifyInternalSecret, verifyPanelToken } from "../auth";
import {
  endScreenSession,
  hasScreenSession,
  isDeviceOnline,
  sendToDevice,
  startScreenSession,
} from "./state";

let panel: ReturnType<SocketIOServer["of"]> | null = null;

// deviceId -> watching socket ids
const watchers = new Map<string, Set<string>>();
// socket id -> device ids it watches (for cleanup)
const watchedBy = new Map<string, Set<string>>();

function roomName(deviceId: string): string {
  return `device:${deviceId}`;
}

function addWatcher(socket: Socket, deviceId: string): void {
  let set = watchers.get(deviceId);
  if (!set) {
    set = new Set();
    watchers.set(deviceId, set);
  }
  set.add(socket.id);
  socket.join(roomName(deviceId));
  let mine = watchedBy.get(socket.id);
  if (!mine) {
    mine = new Set();
    watchedBy.set(socket.id, mine);
  }
  mine.add(deviceId);
}

function removeWatcher(socket: Socket, deviceId: string): void {
  const set = watchers.get(deviceId);
  if (!set) return;
  set.delete(socket.id);
  socket.leave(roomName(deviceId));
  const mine = watchedBy.get(socket.id);
  mine?.delete(deviceId);
  if (set.size === 0) {
    watchers.delete(deviceId);
    stopMirroringIfIdle(deviceId);
  }
}

function cleanupSocket(socket: Socket): void {
  const mine = watchedBy.get(socket.id);
  if (!mine) return;
  for (const deviceId of [...mine]) {
    removeWatcher(socket, deviceId);
  }
  watchedBy.delete(socket.id);
}

// When the last watcher for a device goes away, tell the phone to stop
// encoding frames so we don't burn its battery/bandwidth in the background.
function stopMirroringIfIdle(deviceId: string): void {
  const sessionId = endScreenSession(deviceId);
  if (!sessionId) return;
  console.log(`[panel] last watcher left ${deviceId}; stopping screen session`);
  sendToDevice(deviceId, { type: "screen_stop", sessionId });
}

export function attachPanelServer(server: Server): void {
  const io = new SocketIOServer(server, { path: "/socket.io" });
  const ns = io.of("/panel");
  ns.use((socket, next) => {
    // Server-side callers (Next.js SSE bridge) authenticate with the shared
    // internal secret; browsers authenticate with a short-lived panel token.
    const header = socket.handshake.headers["x-internal-secret"];
    const secret = Array.isArray(header) ? header[0] : header;
    if (verifyInternalSecret(secret ?? null)) {
      next();
      return;
    }
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const token = typeof auth?.token === "string" ? auth.token : "";
    if (token && verifyPanelToken(token)) {
      next();
      return;
    }
    next(new Error("Unauthorized"));
  });

  ns.on("connection", (socket) => {
    console.log("[panel] client connected");

    socket.on("watch_device", (raw: unknown) => {
      const deviceId =
        typeof raw === "object" && raw !== null && "deviceId" in raw
          ? String((raw as { deviceId: unknown }).deviceId)
          : "";
      if (!deviceId) return;
      addWatcher(socket, deviceId);
      if (!hasScreenSession(deviceId)) {
        if (!isDeviceOnline(deviceId)) {
          socket.emit("message", {
            type: "screen_state",
            deviceId,
            active: false,
            error: "Device is offline",
          });
          return;
        }
        const sessionId = randomUUID();
        startScreenSession(deviceId, sessionId);
        console.log(`[panel] starting screen session ${sessionId} for ${deviceId}`);
        sendToDevice(deviceId, {
          type: "screen_start",
          sessionId,
          fps: 4,
          maxW: 540,
          quality: 45,
        });
      }
      socket.emit("message", {
        type: "screen_state",
        deviceId,
        active: true,
      });
    });

    socket.on("unwatch_device", (raw: unknown) => {
      const deviceId =
        typeof raw === "object" && raw !== null && "deviceId" in raw
          ? String((raw as { deviceId: unknown }).deviceId)
          : "";
      if (!deviceId) return;
      removeWatcher(socket, deviceId);
    });

    socket.on("remote_input", (raw: unknown) => {
      const body = raw as { deviceId?: unknown; input?: unknown } | null;
      const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
      if (!deviceId) return;
      const parsed = remoteInputSchema.safeParse(body?.input);
      if (!parsed.success) return;
      sendToDevice(deviceId, { type: "remote_input", input: parsed.data });
    });

    socket.on("disconnect", () => {
      cleanupSocket(socket);
    });
  });
  panel = ns;
}

export function broadcastPanel(msg: RelayToPanel, deviceId?: string): void {
  const parsed = relayToPanelSchema.safeParse(msg);
  if (!parsed.success || !panel) return;
  if (deviceId) {
    // Room-routed messages (screen frames) only go to subscribed clients and
    // are dropped when nobody is watching.
    if ((watchers.get(deviceId)?.size ?? 0) === 0) return;
    panel.to(roomName(deviceId)).emit("message", parsed.data);
    return;
  }
  panel.emit("message", parsed.data);
}
