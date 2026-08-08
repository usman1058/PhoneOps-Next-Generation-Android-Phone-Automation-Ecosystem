import WebSocket from "ws";
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const token = readFileSync("C:/Users/acer/AppData/Local/Temp/opencode/token.txt", "utf8").trim();
const DEVICE_ID = "d94998b3-3c44-48d0-a36b-dd759700c942";
const API_KEY = "78ff1c6b590743c12cd3891769169201c4202f73e62f9c2a08eeffa3a10848fa";

// 1. pages render
for (const path of ["/login", "/dashboard", "/tasks", "/tasks/new"]) {
  const r = await fetch(BASE + path);
  const html = await r.text();
  console.log(`[page] ${path} -> ${r.status} (${html.length} bytes)`);
}

// 2. live SSE receives device_status when device connects/disconnects
const events = [];
const ctrl = new AbortController();
const ssePromise = (async () => {
  const res = await fetch(`${BASE}/api/live`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: ctrl.signal,
  });
  console.log("[sse] status:", res.status);
  if (!res.ok || !res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const ev = JSON.parse(line.slice(6));
            events.push(ev);
            console.log("[sse] event:", ev.type, JSON.stringify(ev));
          } catch {}
        }
      }
    }
  }
})();

await new Promise((r) => setTimeout(r, 1500));

// connect device
const hs = await fetch("http://127.0.0.1:4001/device-auth/handshake", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ apiKey: API_KEY }),
});
const { token: wsToken } = await hs.json();
const ws = new WebSocket("ws://127.0.0.1:4001/device");
await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
ws.send(JSON.stringify({ type: "hello", deviceId: DEVICE_ID, authToken: wsToken }));
await new Promise((r) => setTimeout(r, 2000));
ws.close();
await new Promise((r) => setTimeout(r, 2000));

ctrl.abort();
await ssePromise.catch(() => {});

const onlineEvent = events.some((e) => e.type === "device_status" && e.isOnline === true);
const offlineEvent = events.some((e) => e.type === "device_status" && e.isOnline === false);
console.log("device_status online event:", onlineEvent);
console.log("device_status offline event:", offlineEvent);
console.log(onlineEvent && offlineEvent ? "STEP 9 PASS" : "STEP 9 FAIL");
process.exit(onlineEvent && offlineEvent ? 0 : 1);
