import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import { deviceToRelaySchema } from "@automation/shared";
import { prisma } from "../db";
import { verifyDeviceWsToken } from "../auth";
import { broadcastPanel } from "./panelServer";
import {
  addOnline,
  endScreenSession,
  isDeviceOnline,
  isScreenSession,
  removeOnline,
} from "./state";
import { flushPendingRuns, handleRunComplete, handleStepResult } from "../run";
import { appendRecordingSteps, storeLatestRecording } from "../recordings";
import { resolveAppList } from "../apps";

const wss = new WebSocketServer({ noServer: true });

export function attachDeviceServer(server: Server): void {
  server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname === "/device") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", (ws) => {
    let authed = false;
    let deviceId: string | null = null;

    const authTimer = setTimeout(() => {
      if (!authed) {
        ws.close(4401, "Unauthorized");
      }
    }, 5000);

    ws.on("message", async (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.close(4400, "Bad message");
        return;
      }

      const parsed = deviceToRelaySchema.safeParse(msg);
      if (!parsed.success) {
        return;
      }
      const m = parsed.data;

      if (m.type === "hello") {
        const payload = verifyDeviceWsToken(m.authToken);
        if (!payload || payload.deviceId !== m.deviceId) {
          ws.close(4401, "Unauthorized");
          return;
        }
        const device = await prisma.device.findUnique({
          where: { id: m.deviceId },
        });
        if (!device) {
          ws.close(4401, "Unauthorized");
          return;
        }
        authed = true;
        deviceId = m.deviceId;
        clearTimeout(authTimer);
        addOnline(deviceId, ws);
        await prisma.device.update({
          where: { id: deviceId },
          data: { isOnline: true, lastSeenAt: new Date() },
        });
        broadcastPanel({ type: "device_status", deviceId, isOnline: true });
        await flushPendingRuns(deviceId);
        return;
      }

      if (!authed) {
        ws.close(4401, "Unauthorized");
        return;
      }

      if (m.type === "step_result") {
        await handleStepResult(m.runId, m.stepIndex, m.status);
      } else if (m.type === "run_complete") {
        await handleRunComplete(m.runId, m.status, m.error);
      } else if (m.type === "recording_steps") {
        appendRecordingSteps(m.sessionId, m.steps);
      } else if (m.type === "task_recorded" && deviceId) {
        storeLatestRecording(deviceId, m.steps);
      } else if (m.type === "app_list") {
        resolveAppList(m.requestId, m.apps);
      } else if (m.type === "screen_frame" && deviceId) {
        // Drop frames for stale/unknown sessions so a rogue device can't
        // stream to the panel uninvited.
        if (isScreenSession(deviceId, m.sessionId)) {
          broadcastPanel(
            {
              type: "screen_frame",
              deviceId,
              sessionId: m.sessionId,
              w: m.w,
              h: m.h,
              data: m.data,
            },
            deviceId,
          );
        }
      } else if (m.type === "fcm_token" && deviceId) {
        await prisma.device.update({
          where: { id: deviceId },
          data: { fcmToken: m.token },
        });
      }
    });

    ws.on("close", async () => {
      clearTimeout(authTimer);
      if (authed && deviceId) {
        const endedSession = endScreenSession(deviceId);
        if (endedSession) {
          broadcastPanel({
            type: "screen_state",
            deviceId,
            active: false,
            error: "Device disconnected",
          });
        }
        removeOnline(deviceId, ws);
        if (!isDeviceOnline(deviceId)) {
          await prisma.device
            .update({
              where: { id: deviceId },
              data: { isOnline: false, lastSeenAt: new Date() },
            })
            .catch(() => undefined);
          broadcastPanel({ type: "device_status", deviceId, isOnline: false });
        }
      }
    });
  });
}
