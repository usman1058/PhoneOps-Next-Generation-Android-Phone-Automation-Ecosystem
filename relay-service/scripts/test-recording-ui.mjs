import WebSocket from "ws";
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const token = readFileSync("C:/Users/acer/AppData/Local/Temp/opencode/token.txt", "utf8").trim();
const DEVICE_ID = "d94998b3-3c44-48d0-a36b-dd759700c942";
const API_KEY = "78ff1c6b590743c12cd3891769169201c4202f73e62f9c2a08eeffa3a10848fa";
const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

// fake device connects
const hs = await fetch("http://127.0.0.1:4001/device-auth/handshake", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ apiKey: API_KEY }),
});
const { token: wsToken } = await hs.json();
const ws = new WebSocket("ws://127.0.0.1:4001/device");
await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
ws.send(JSON.stringify({ type: "hello", deviceId: DEVICE_ID, authToken: wsToken }));

// device listens for start_recording, replies with steps after 2s
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "start_recording") {
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: "recording_steps",
        sessionId: msg.sessionId,
        steps: [
          { action: "open_app", package: "com.whatsapp" },
          { action: "tap_by_text", text: "Search" },
          { action: "swipe", fromX: 200, fromY: 800, toX: 200, toY: 300, durationMs: 250 },
        ],
      }));
    }, 2000);
  }
});
await new Promise((r) => setTimeout(r, 300));

// UI flow: start recording
const start = await (await fetch(`${BASE}/api/recordings/start`, {
  method: "POST", headers: H, body: JSON.stringify({ deviceId: DEVICE_ID }),
})).json();
console.log("recording started:", start.sessionId);

await new Promise((r) => setTimeout(r, 2500));

// UI flow: stop recording -> steps
const stop = await (await fetch(`${BASE}/api/recordings/${start.sessionId}/stop`, {
  method: "POST", headers: H,
})).json();
console.log("recording stopped, steps:", JSON.stringify(stop.steps));

// UI flow: save as task
const task = await (await fetch(`${BASE}/api/tasks`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: "Recorded task", deviceId: DEVICE_ID, steps: stop.steps }),
})).json();
console.log("task created:", task.id ? "OK " + task.id : JSON.stringify(task));

ws.close();
const ok = stop.steps?.length === 3 && !!task.id;
console.log(ok ? "RECORDING->TASK PASS" : "RECORDING->TASK FAIL");
process.exit(ok ? 0 : 1);
