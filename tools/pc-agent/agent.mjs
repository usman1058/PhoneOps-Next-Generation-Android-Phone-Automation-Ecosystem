#!/usr/bin/env node
/**
 * PhoneOps Windows agent.
 *
 * Connects OUTBOUND to the relay (no port forwarding needed), registers as a
 * PC, streams JPEG screen frames to the phone that opens a viewing session,
 * and injects mouse/keyboard input on request.
 *
 * Required env:
 *   RELAY_URL            e.g. https://phoneops-relay.onrender.com
 *   RELAY_INTERNAL_SECRET same secret as relay-service
 * Optional:
 *   AGENT_NAME           display name (defaults to hostname)
 *   PC_FPS / PC_WIDTH / PC_QUALITY
 */

import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const here = path.dirname(fileURLToPath(import.meta.url));

const RELAY_URL = (process.env.RELAY_URL ?? "").replace(/\/+$/, "");
const SECRET = process.env.RELAY_INTERNAL_SECRET ?? "";
const AGENT_NAME = process.env.AGENT_NAME ?? os.hostname();
const FPS = Number(process.env.PC_FPS ?? 5);
const WIDTH = Number(process.env.PC_WIDTH ?? 900);
const QUALITY = Number(process.env.PC_QUALITY ?? 45);

if (!RELAY_URL || !SECRET) {
  console.error(
    "Set RELAY_URL and RELAY_INTERNAL_SECRET env vars before starting the agent.",
  );
  process.exit(1);
}

let ws = null;
let captureProc = null;
let captureSession = null;
let frameSize = null; // { w, h } of the streamed frames
let injectProc = null;
let backoffMs = 2000;

function ensureInjectProc() {
  if (injectProc && !injectProc.killed) return injectProc;
  injectProc = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "-"],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  injectProc.stdin.setEncoding("utf8");
  injectProc.stderr.on("data", (d) =>
    console.error("[inject]", String(d).trim()),
  );
  // Prime the persistent PowerShell host so the first action is fast.
  injectProc.stdin.write('"" | Out-Null\n');
  return injectProc;
}

function startCapture(sessionId) {
  stopCapture();
  captureSession = sessionId;
  console.log(`[agent] streaming session ${sessionId} (${FPS}fps, ${WIDTH}px)`);

  captureProc = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(here, "capture.ps1"),
      "-TargetW",
      String(WIDTH),
      "-Fps",
      String(FPS),
      "-Quality",
      String(QUALITY),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let buffer = "";
  let metaDone = false;
  captureProc.stdout.setEncoding("utf8");
  captureProc.stdout.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line || !ws || ws.readyState !== WebSocket.OPEN) continue;

      if (!metaDone) {
        try {
          frameSize = JSON.parse(line);
          metaDone = true;
          console.log(`[agent] frame size ${frameSize.w}x${frameSize.h}`);
        } catch {
          // skip malformed header
        }
        continue;
      }

      if (!frameSize) continue;
      ws.send(
        JSON.stringify({
          type: "pc_frame",
          sessionId,
          w: frameSize.w,
          h: frameSize.h,
          data: line,
        }),
      );
    }
  });

  captureProc.stderr.on("data", (d) =>
    console.error("[capture]", String(d).trim()),
  );
  captureProc.on("exit", () => {
    if (captureProc) {
      console.log("[agent] capture loop exited");
    }
    captureProc = null;
  });
}

function stopCapture() {
  captureSession = null;
  frameSize = null;
  if (captureProc) {
    try {
      captureProc.kill();
    } catch {}
    captureProc = null;
  }
}

function handleAction(action) {
  const proc = ensureInjectProc();
  try {
    proc.stdin.write(JSON.stringify(action) + "\n");
  } catch (e) {
    console.error("[agent] failed to write action", e.message);
  }
}

function connect() {
  const url = `${RELAY_URL.replace(/^http/, "ws")}/agent`;
  console.log(`[agent] connecting to ${url} as "${AGENT_NAME}"…`);
  ws = new WebSocket(url, {
    headers: { "x-internal-secret": SECRET },
  });

  ws.on("open", () => {
    backoffMs = 2000;
    ws.send(JSON.stringify({ type: "hello_agent", name: AGENT_NAME }));
    console.log("[agent] connected");
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case "pc_start":
        startCapture(msg.sessionId);
        break;
      case "pc_stop":
        stopCapture();
        break;
      case "pc_inject":
        handleAction(msg.action);
        break;
    }
  });

  ws.on("close", () => {
    console.log("[agent] disconnected; retrying…");
    stopCapture();
    setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 1.5, 30_000);
  });

  ws.on("error", (err) => {
    console.error("[agent] socket error:", err.message);
  });
}

process.on("SIGINT", () => {
  stopCapture();
  try {
    injectProc?.kill();
  } catch {}
  try {
    ws?.close();
  } catch {}
  process.exit(0);
});

connect();
