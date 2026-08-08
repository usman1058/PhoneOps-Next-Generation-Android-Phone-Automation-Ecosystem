import type { WebSocket } from "ws";
import type { RelayToDevice } from "@automation/shared";

const online = new Map<string, Set<WebSocket>>();
const pendingRuns = new Map<string, string[]>();

export function addOnline(deviceId: string, ws: WebSocket): void {
  let set = online.get(deviceId);
  if (!set) {
    set = new Set();
    online.set(deviceId, set);
  }
  set.add(ws);
}

export function removeOnline(deviceId: string, ws: WebSocket): void {
  const set = online.get(deviceId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) online.delete(deviceId);
}

export function isDeviceOnline(deviceId: string): boolean {
  const set = online.get(deviceId);
  return !!set && set.size > 0;
}

export function onlineDevices(): string[] {
  return [...online.keys()];
}

function getDeviceSockets(deviceId: string): WebSocket[] {
  return [...(online.get(deviceId) ?? [])];
}

export function sendToDevice(deviceId: string, msg: RelayToDevice): void {
  const data = JSON.stringify(msg);
  const sockets = getDeviceSockets(deviceId);
  console.log(`[sendToDevice] ${deviceId}: ${sockets.length} socket(s), states: ${sockets.map(s => s.readyState).join(',')}`);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
      console.log(`[sendToDevice] sent to ${deviceId}`);
    } else {
      console.log(`[sendToDevice] socket not OPEN (${ws.readyState}) for ${deviceId}`);
    }
  }
}

export function addPendingRun(deviceId: string, runId: string): void {
  const arr = pendingRuns.get(deviceId) ?? [];
  arr.push(runId);
  pendingRuns.set(deviceId, arr);
}

export function takePendingRuns(deviceId: string): string[] {
  const arr = pendingRuns.get(deviceId) ?? [];
  pendingRuns.delete(deviceId);
  return arr;
}
