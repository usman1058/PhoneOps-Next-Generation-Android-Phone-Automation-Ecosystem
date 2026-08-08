import { prisma } from "./db";
import { isSteps } from "@automation/shared";
import type { Step } from "@automation/shared";
import {
  addPendingRun,
  isDeviceOnline,
  sendToDevice,
  takePendingRuns,
} from "./sockets/state";
import { broadcastPanel } from "./sockets/panelServer";
import { sendFcmWakeup } from "./fcm";

type StepResult = { stepIndex: number; status: string; error?: string };

const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS ?? 5 * 60_000);
const runTimeouts = new Map<string, NodeJS.Timeout>();

function asStepResults(value: unknown): StepResult[] {
  return Array.isArray(value) ? (value as StepResult[]) : [];
}

function clearRunTimeout(runId: string): void {
  const timer = runTimeouts.get(runId);
  if (timer) {
    clearTimeout(timer);
    runTimeouts.delete(runId);
  }
}

function scheduleRunTimeout(runId: string, delayMs = RUN_TIMEOUT_MS): void {
  clearRunTimeout(runId);
  const timer = setTimeout(() => {
    void failTimedOutRun(runId);
  }, delayMs);
  runTimeouts.set(runId, timer);
}

async function failTimedOutRun(runId: string): Promise<void> {
  clearRunTimeout(runId);
  const run = await prisma.taskRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, stepResults: true },
  });
  if (!run || run.status !== "running") {
    return;
  }

  const results = asStepResults(run.stepResults);
  const error = "Timed out waiting for device response";
  if (results.length === 0) {
    results.push({ stepIndex: 0, status: "failed", error });
  } else {
    results.push({ stepIndex: results.length, status: "failed", error });
  }

  await prisma.taskRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      finishedAt: new Date(),
      stepResults: results,
    },
  });
  broadcastPanel({ type: "run_update", runId, status: "failed" });
}

export async function startRun(
  taskId: string,
  triggeredBy: "manual" | "schedule",
): Promise<{ ok: boolean; runId?: string; error?: string }> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found" };
  if (!task.isEnabled) return { ok: false, error: "Task is disabled" };
  if (!isSteps(task.steps)) return { ok: false, error: "Task steps are invalid" };
  const steps = task.steps as unknown as Step[];

  const device = await prisma.device.findUnique({
    where: { id: task.deviceId },
  });
  if (!device) return { ok: false, error: "Device not found" };

  const run = await prisma.taskRun.create({
    data: {
      taskId: task.id,
      deviceId: task.deviceId,
      triggeredBy,
      status: "running",
      stepResults: [],
    },
  });
  scheduleRunTimeout(run.id);

  if (isDeviceOnline(task.deviceId)) {
    console.log(`[run] sending run_task to ${task.deviceId} for run ${run.id}`);
    sendToDevice(task.deviceId, { type: "run_task", runId: run.id, steps });
  } else {
    const pushSent = await sendFcmWakeup(task.deviceId, device.fcmToken);
    if (!pushSent) {
      clearRunTimeout(run.id);
      await prisma.taskRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          stepResults: [
            { stepIndex: 0, status: "failed", error: "Device is offline" },
          ],
        },
      });
      broadcastPanel({ type: "run_update", runId: run.id, status: "failed" });
      return {
        ok: false,
        runId: run.id,
        error: "Device is offline and no push wake-up configured",
      };
    }
    addPendingRun(task.deviceId, run.id);
  }

  broadcastPanel({ type: "run_update", runId: run.id, status: "running" });
  return { ok: true, runId: run.id };
}

export async function flushPendingRuns(deviceId: string): Promise<void> {
  const runIds = takePendingRuns(deviceId);
  for (const runId of runIds) {
    const run = await prisma.taskRun.findUnique({
      where: { id: runId },
      include: { task: true },
    });
    if (!run) continue;
    if (!isSteps(run.task.steps)) continue;
    sendToDevice(deviceId, {
      type: "run_task",
      runId: run.id,
      steps: run.task.steps as unknown as Step[],
    });
  }
}

export async function reconcileRunningRuns(): Promise<void> {
  const runningRuns = await prisma.taskRun.findMany({
    where: { status: "running" },
    select: { id: true, startedAt: true },
  });

  const now = Date.now();
  for (const run of runningRuns) {
    const ageMs = now - run.startedAt.getTime();
    if (ageMs >= RUN_TIMEOUT_MS) {
      await failTimedOutRun(run.id);
      continue;
    }

    scheduleRunTimeout(run.id, RUN_TIMEOUT_MS - ageMs);
  }
}

export async function handleStepResult(
  runId: string,
  stepIndex: number,
  status: "success" | "failed",
): Promise<void> {
  const run = await prisma.taskRun.findUnique({ where: { id: runId } });
  if (!run) return;
  const results = asStepResults(run.stepResults);
  const idx = results.findIndex((r) => r.stepIndex === stepIndex);
  const entry: StepResult = { stepIndex, status };
  if (idx >= 0) {
    results[idx] = { ...results[idx], ...entry };
  } else {
    results.push(entry);
  }
  await prisma.taskRun.update({
    where: { id: runId },
    data: { stepResults: results },
  });
  broadcastPanel({ type: "run_update", runId, status: "running", stepIndex });
}

export async function handleRunComplete(
  runId: string,
  status: "success" | "failed" | "partial",
  error?: string,
): Promise<void> {
  clearRunTimeout(runId);
  const run = await prisma.taskRun.findUnique({ where: { id: runId } });
  if (!run) return;
  const results = asStepResults(run.stepResults);
  if (status === "failed" && error) {
    const failedIdx = results.findIndex((r) => r.status === "failed");
    if (failedIdx >= 0) {
      results[failedIdx] = { ...results[failedIdx], error };
    } else {
      results.push({ stepIndex: results.length, status: "failed", error });
    }
  }
  const lastIndex =
    results.length > 0 ? results[results.length - 1].stepIndex : undefined;
  await prisma.taskRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      stepResults: results,
    },
  });
  broadcastPanel({ type: "run_update", runId, status, stepIndex: lastIndex });
}
