import { randomUUID } from "node:crypto";
import type { Step } from "@automation/shared";
import { sendToDevice, isDeviceOnline } from "./sockets/state";
import { broadcastPanel } from "./sockets/panelServer";

type Waiter = { resolve: (steps: Step[]) => void };
type RecordingSession = {
  deviceId: string;
  startedAt: number;
  steps: Step[];
  waiters: Waiter[];
};

const sessions = new Map<string, RecordingSession>();

export function startRecording(deviceId: string): {
  ok: boolean;
  sessionId?: string;
  error?: string;
} {
  if (!isDeviceOnline(deviceId)) {
    return { ok: false, error: "Device is offline" };
  }
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    deviceId,
    startedAt: Date.now(),
    steps: [],
    waiters: [],
  });
  sendToDevice(deviceId, { type: "start_recording", sessionId });
  broadcastPanel({
    type: "recording_update",
    sessionId,
    deviceId,
    status: "recording",
  });
  return { ok: true, sessionId };
}

export function appendRecordingSteps(
  sessionId: string,
  steps: Step[],
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.steps.push(...steps);
  for (const waiter of session.waiters) {
    waiter.resolve([...session.steps]);
  }
  session.waiters = [];
  broadcastPanel({
    type: "recording_update",
    sessionId,
    deviceId: session.deviceId,
    status: "recording",
  });
}

export function stopRecording(
  sessionId: string,
): { ok: boolean; steps?: Step[]; error?: string } | Promise<{ ok: boolean; steps?: Step[]; error?: string }> {
  const session = sessions.get(sessionId);
  if (!session) return { ok: false, error: "Session not found" };

  sendToDevice(session.deviceId, { type: "stop_recording", sessionId });

  if (session.steps.length > 0) {
    sessions.delete(sessionId);
    return { ok: true, steps: session.steps };
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sessions.delete(sessionId);
      resolve({ ok: true, steps: session.steps });
    }, 3000);
    session.waiters.push({
      resolve: (steps) => {
        clearTimeout(timer);
        sessions.delete(sessionId);
        resolve({ ok: true, steps });
      },
    });
  });
}

const latestRecordings = new Map<string, Step[]>();

export function storeLatestRecording(deviceId: string, steps: Step[]): void {
  latestRecordings.set(deviceId, steps);
}

export function getLatestRecording(deviceId: string): Step[] | null {
  return latestRecordings.get(deviceId) ?? null;
}
