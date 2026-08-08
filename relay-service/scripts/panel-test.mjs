import { io } from "socket.io-client";
import "dotenv/config";

// Never hardcode the internal secret. Load it from the relay's own .env so the
// script can be committed to the repository safely.
const SECRET = process.env.RELAY_INTERNAL_SECRET ?? "";

function attempt(url, secret, transports) {
  return new Promise((resolve) => {
    const socket = io(url, {
      transports,
      extraHeaders: secret ? { "x-internal-secret": secret } : {},
      reconnection: false,
      timeout: 5000,
    });
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; socket.close(); resolve(r); } };
    socket.on("connect", () => done({ ok: true, transport: socket.io.engine.transport.name }));
    socket.on("connect_error", (e) => done({ ok: false, reason: e.message }));
    setTimeout(() => done({ ok: false, reason: "timeout" }), 8000);
  });
}

const tests = [
  ["panel+default-transports+good", "http://127.0.0.1:4001/panel", SECRET, ["polling", "websocket"]],
  ["panel+ws-only+good", "http://127.0.0.1:4001/panel", SECRET, ["websocket"]],
  ["root+ws-only", "http://127.0.0.1:4001", null, ["websocket"]],
  ["root+default", "http://127.0.0.1:4001", null, ["polling", "websocket"]],
];

for (const [name, url, secret, transports] of tests) {
  const r = await attempt(url, secret, transports);
  console.log(`${r.ok ? "OK  " : "FAIL"}  ${name}: ${r.ok ? "connected via " + r.transport : r.reason}`);
}
process.exit(0);
