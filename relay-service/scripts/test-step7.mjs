import WebSocket from "ws";
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const token = readFileSync("C:/Users/acer/AppData/Local/Temp/opencode/token.txt", "utf8").trim();
const DEVICE_ID = "d94998b3-3c44-48d0-a36b-dd759700c942";
const API_KEY = "78ff1c6b590743c12cd3891769169201c4202f73e62f9c2a08eeffa3a10848fa";
const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

const hs = await fetch("http://127.0.0.1:4001/device-auth/handshake", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ apiKey: API_KEY }),
});
const { token: wsToken } = await hs.json();

const ws = new WebSocket("ws://127.0.0.1:4001/device");
await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
ws.send(JSON.stringify({ type: "hello", deviceId: DEVICE_ID, authToken: wsToken }));
await new Promise((r) => setTimeout(r, 500));

// register the message handler BEFORE starting, to avoid losing the event
const gotStart = new Promise((resolve) => {
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "start_recording") {
      resolve(msg);
      ws.send(JSON.stringify({
        type: "recording_steps",
        sessionId: msg.sessionId,
        steps: [
          { action: "tap_by_coordinates", x: 100, y: 200 },
          { action: "swipe", fromX: 0, fromY: 500, toX: 300, toY: 500, durationMs: 300 },
        ],
      }));
    }
  });
  setTimeout(() => resolve(null), 4000);
});

// 1. start recording
const startRes = await fetch(`${BASE}/api/recordings/start`, {
  method: "POST", headers: H, body: JSON.stringify({ deviceId: DEVICE_ID }),
});
const startBody = await startRes.json();
console.log("start recording:", startRes.status, startBody.sessionId ? `sessionId=${startBody.sessionId}` : startBody.error);
const sessionId = startBody.sessionId;
if (!sessionId) process.exit(1);

// 2. device should receive start_recording
const receivedStart = await gotStart;
console.log("device got start_recording:", receivedStart ? `sessionId=${receivedStart.sessionId}` : "TIMEOUT");

await new Promise((r) => setTimeout(r, 500));

// 4. stop recording -> should return captured steps
const stopRes = await fetch(`${BASE}/api/recordings/${sessionId}/stop`, {
  method: "POST", headers: H,
});
const stopBody = await stopRes.json();
console.log("stop recording:", stopRes.status, "steps:", JSON.stringify(stopBody.steps));

// 5. stop again -> expect 404 (session consumed)
const stopRes2 = await fetch(`${BASE}/api/recordings/${sessionId}/stop`, {
  method: "POST", headers: H,
});
console.log("stop again:", stopRes2.status, JSON.stringify(await stopRes2.json()));

ws.close();
const ok = stopRes.status === 200 && Array.isArray(stopBody.steps) && stopBody.steps.length === 2 && stopRes2.status === 404;
console.log(ok ? "STEP 7 PASS" : "STEP 7 FAIL");
process.exit(ok ? 0 : 1);
