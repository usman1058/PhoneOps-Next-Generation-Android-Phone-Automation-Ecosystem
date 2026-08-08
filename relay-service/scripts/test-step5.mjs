import WebSocket from "ws";
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const token = readFileSync("C:/Users/acer/AppData/Local/Temp/opencode/token.txt", "utf8").trim();
const DEVICE_ID = "d94998b3-3c44-48d0-a36b-dd759700c942";
const API_KEY = "78ff1c6b590743c12cd3891769169201c4202f73e62f9c2a08eeffa3a10848fa";

const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const out = (label, r, body) => {
  const code = r;
  const extra = body?.error ? ` error=${body.error}` : body?.id ? ` id=${body.id}` : "";
  console.log(`[${label}] HTTP ${code}${extra}`);
  return { code, body };
};

const validSteps = [
  { action: "open_app", package: "com.whatsapp" },
  { action: "wait", ms: 2000 },
  { action: "home" },
];

async function call(method, path, data) {
  const r = await fetch(BASE + path, {
    method,
    headers: data !== undefined ? H : { Authorization: H.Authorization },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  const body = await r.json().catch(() => null);
  return { r: r.status, body };
}

// 1. Create valid task
let { r, body } = await call("POST", "/api/tasks", {
  name: "Open WhatsApp", deviceId: DEVICE_ID, steps: validSteps,
});
out("create valid task", r, body);
const taskId = body.id;
if (!taskId) { console.log("ABORT: no task id"); process.exit(1); }

// 2. Invalid steps -> 400
({ r, body } = await call("POST", "/api/tasks", {
  name: "Bad", deviceId: DEVICE_ID, steps: [{ action: "do_magic" }],
}));
out("create bad steps", r, body);

// 3. Bad cron -> 400
({ r, body } = await call("POST", "/api/tasks", {
  name: "Bad cron", deviceId: DEVICE_ID, steps: validSteps, schedule: "not-a-cron",
}));
out("create bad cron", r, body);

// 4. List tasks
({ r, body } = await call("GET", "/api/tasks"));
out("list tasks", r, body);
console.log("   task count:", Array.isArray(body) ? body.length : "?");

// 5. Run while device offline (no FCM) -> expect 409
({ r, body } = await call("POST", `/api/tasks/${taskId}/run`));
out("run offline", r, body);

// 6. Connect device, run, complete run
const hs = await fetch("http://127.0.0.1:4001/device-auth/handshake", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ apiKey: API_KEY }),
});
const { token: wsToken } = await hs.json();

const ws = new WebSocket("ws://127.0.0.1:4001/device");
await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
ws.send(JSON.stringify({ type: "hello", deviceId: DEVICE_ID, authToken: wsToken }));

const received = await new Promise((resolve) => {
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "run_task") {
      resolve(msg);
      ws.send(JSON.stringify({ type: "step_result", runId: msg.runId, stepIndex: 0, status: "success" }));
      setTimeout(() => {
        ws.send(JSON.stringify({ type: "run_complete", runId: msg.runId, status: "success" }));
        setTimeout(() => ws.close(), 300);
      }, 300);
    }
  });
  call("POST", `/api/tasks/${taskId}/run`).then(({ r, body }) => {
    console.log(`[run online] HTTP ${r}${body?.runId ? ` runId=${body.runId}` : body?.error ? ` error=${body.error}` : ""}`);
  });
  setTimeout(() => resolve(null), 8000);
});
console.log("[run online] run_task received:", received ? `runId=${received.runId}, steps=${received.steps.length}` : "TIMEOUT");

await new Promise((r2) => setTimeout(r2, 1000));

// 7. Run history
({ r, body } = await call("GET", `/api/tasks/${taskId}/runs`));
out("runs history", r, body);
if (Array.isArray(body)) {
  body.forEach((run) => {
    console.log(`   run ${run.status} triggeredBy=${run.triggeredBy} steps=${JSON.stringify(run.stepResults)} finishedAt=${run.finishedAt ? "yes" : "no"}`);
  });
}

process.exit(0);
