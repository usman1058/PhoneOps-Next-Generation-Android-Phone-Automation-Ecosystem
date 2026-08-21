import { Router } from "express";
import { rateLimit, isLoopback } from "@automation/shared/rate-limit";
import { verifyInternalSecret, signPanelToken } from "../auth";
import { startRun } from "../run";
import { onlineDevices } from "../sockets/state";
import { startRecording, stopRecording } from "../recordings";
import { requestAppList } from "../apps";
import { getLatestRecording } from "../recordings";
import { lanUrls } from "../lan-discovery";

export const internalRouter = Router();

internalRouter.use((req, res, next) => {
  const secret = req.header("x-internal-secret");
  if (!verifyInternalSecret(secret ?? null)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim()) ??
    req.socket.remoteAddress ??
    "unknown";
  const limited = isLoopback(ip) ? { ok: true } : rateLimit(`internal:${ip}`, 60, 60_000);
  if (!limited.ok) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  next();
});

internalRouter.post("/run-task", async (req, res) => {
  const body = (req.body ?? {}) as {
    taskId?: unknown;
    triggeredBy?: unknown;
  };
  if (typeof body.taskId !== "string") {
    res.status(400).json({ error: "taskId is required" });
    return;
  }
  const triggeredBy =
    body.triggeredBy === "schedule" ? "schedule" : "manual";
  const result = await startRun(body.taskId, triggeredBy);
  if (!result.ok) {
    res
      .status(result.error === "Task not found" ? 404 : 409)
      .json({ error: result.error });
    return;
  }
  res.json({ runId: result.runId });
});

internalRouter.post("/start-recording", (req, res) => {
  const body = (req.body ?? {}) as { deviceId?: unknown };
  if (typeof body.deviceId !== "string") {
    res.status(400).json({ error: "deviceId is required" });
    return;
  }
  const result = startRecording(body.deviceId);
  if (!result.ok) {
    res.status(409).json({ error: result.error });
    return;
  }
  res.json({ sessionId: result.sessionId });
});

internalRouter.post("/stop-recording", async (req, res) => {
  const body = (req.body ?? {}) as { sessionId?: unknown };
  if (typeof body.sessionId !== "string") {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  const result = await stopRecording(body.sessionId);
  if (!result.ok) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json({ sessionId: body.sessionId, steps: result.steps });
});

internalRouter.get("/status", (_req, res) => {
  res.json({ devices: onlineDevices() });
});

internalRouter.get("/lan-urls", (_req, res) => {
  res.json({ urls: lanUrls() });
});

internalRouter.get("/devices/:deviceId/apps", async (req, res) => {
  const apps = await requestAppList(req.params.deviceId);
  if (!apps) {
    res.status(409).json({ error: "Device is offline or did not respond" });
    return;
  }
  res.json({ apps });
});

internalRouter.get("/devices/:deviceId/latest-recording", (req, res) => {
  const steps = getLatestRecording(req.params.deviceId);
  if (!steps) {
    res.status(404).json({ error: "No recording available for this device" });
    return;
  }
  res.json({ steps });
});

// Short-lived token that lets a browser open its own Socket.IO connection to
// the /panel namespace (used by the live screen mirror) without exposing the
// internal secret.
internalRouter.get("/panel-token", (_req, res) => {
  res.json({ token: signPanelToken() });
});
