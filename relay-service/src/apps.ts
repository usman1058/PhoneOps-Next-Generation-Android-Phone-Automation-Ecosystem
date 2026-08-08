import { randomUUID } from "node:crypto";
import type { AppInfo } from "@automation/shared";
import { sendToDevice, isDeviceOnline } from "./sockets/state";

type Waiter = { resolve: (apps: AppInfo[] | null) => void; timer: NodeJS.Timeout };

const waiters = new Map<string, Waiter>();

export function requestAppList(
  deviceId: string,
  timeoutMs = 8000,
): Promise<AppInfo[] | null> {
  if (!isDeviceOnline(deviceId)) {
    return Promise.resolve(null);
  }
  const requestId = randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(requestId);
      resolve(null);
    }, timeoutMs);
    waiters.set(requestId, { resolve, timer });
    sendToDevice(deviceId, { type: "list_apps", requestId });
  });
}

export function resolveAppList(requestId: string, apps: AppInfo[]): void {
  const waiter = waiters.get(requestId);
  if (!waiter) return;
  clearTimeout(waiter.timer);
  waiters.delete(requestId);
  waiter.resolve(apps);
}
