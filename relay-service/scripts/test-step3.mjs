import WebSocket from "ws";
import "dotenv/config";

const BASE = "http://127.0.0.1:4001";
const WS_URL = "ws://127.0.0.1:4001";
const API_KEY = process.argv[2] ?? "test-api-key-123";
const SECRET = process.env.RELAY_INTERNAL_SECRET ?? "";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures++;
}

async function post(path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function openWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL + "/device");
    ws.on("open", () => resolve(ws));
    ws.on("error", (e) => reject(e));
  });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const hsBad = await post("/device-auth/handshake", { apiKey: "wrong-key" });
  check("handshake rejects wrong apiKey", hsBad.status === 401, `status=${hsBad.status}`);

  const hsOk = await post("/device-auth/handshake", { apiKey: API_KEY });
  check("handshake issues token", hsOk.status === 200 && typeof hsOk.body.token === "string", `status=${hsOk.status}`);
  const token = hsOk.body.token;
  const deviceId = hsOk.body.deviceId;

  const noHello = await openWs();
  let noHelloClosed = false;
  let noHelloCode;
  noHello.on("close", (code) => { noHelloClosed = true; noHelloCode = code; });
  await wait(7000);
  check("socket without hello is rejected within 5s", noHelloClosed && noHelloCode === 4401, `closed=${noHelloClosed} code=${noHelloCode}`);

  const badToken = await openWs();
  let badClosed = false;
  let badCode;
  badToken.on("close", (code) => { badClosed = true; badCode = code; });
  badToken.send(JSON.stringify({ type: "hello", deviceId, authToken: "invalid-token" }));
  await wait(2000);
  check("socket with bad token rejected", badClosed && badCode === 4401, `closed=${badClosed} code=${badCode}`);

  const good = await openWs();
  let goodClosed = false;
  good.on("close", () => { goodClosed = true; });
  good.send(JSON.stringify({ type: "hello", deviceId, authToken: token }));
  await wait(2000);
  check("socket with good token stays open", !goodClosed, `closed=${goodClosed}`);

  const statusOnline = await fetch(BASE + "/internal/status", { method: "GET", headers: { "x-internal-secret": SECRET } });
  const onlineBody = await statusOnline.json().catch(() => null);
  check("status reports device online while connected", Array.isArray(onlineBody?.devices) && onlineBody.devices.includes(deviceId), `devices=${JSON.stringify(onlineBody?.devices)}`);

  good.close();
  await wait(1500);
  const statusOffline = await fetch(BASE + "/internal/status", { method: "GET", headers: { "x-internal-secret": SECRET } });
  const offlineBody = await statusOffline.json().catch(() => null);
  check("status reports device offline after disconnect", Array.isArray(offlineBody?.devices) && !offlineBody.devices.includes(deviceId), `devices=${JSON.stringify(offlineBody?.devices)}`);

  const noSecret = await post("/internal/run-task", { taskId: "nope" });
  check("internal endpoint rejects missing secret", noSecret.status === 401, `status=${noSecret.status}`);

  const badSecret = await post("/internal/run-task", { taskId: "nope" }, { "x-internal-secret": "wrong" });
  check("internal endpoint rejects wrong secret", badSecret.status === 401, `status=${badSecret.status}`);

  const statusNoSecret = await fetch(BASE + "/internal/status", { method: "GET" });
  check("internal status rejects missing secret", statusNoSecret.status === 401, `status=${statusNoSecret.status}`);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
