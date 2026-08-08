import WebSocket from "ws";
import { readFileSync } from "node:fs";

const API_KEY = "78ff1c6b590743c12cd3891769169201c4202f73e62f9c2a08eeffa3a10848fa";
const token = readFileSync("C:/Users/acer/AppData/Local/Temp/opencode/token.txt", "utf8").trim();

const handshake = await fetch("http://127.0.0.1:4001/device-auth/handshake", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ apiKey: API_KEY }),
});
const { token: wsToken, deviceId } = await handshake.json();
console.log("handshake deviceId:", deviceId);

const ws = new WebSocket("ws://127.0.0.1:4001/device");
await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
ws.send(JSON.stringify({ type: "hello", deviceId, authToken: wsToken }));

await new Promise((r) => setTimeout(r, 2000));

const res = await fetch("http://127.0.0.1:3000/api/devices", {
  headers: { Authorization: `Bearer ${token}` },
});
const devices = await res.json();
const dev = devices.find((d) => d.id === deviceId);
console.log("web shows device:", dev ? `${dev.name} isOnline=${dev.isOnline}` : "not found");

ws.close();
process.exit(dev && dev.isOnline ? 0 : 1);
