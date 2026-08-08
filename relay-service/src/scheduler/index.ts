import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { prisma } from "../db";
import { startRun } from "../run";

const scheduled = new Map<string, ScheduledTask>();

export async function syncSchedules(): Promise<void> {
  for (const job of scheduled.values()) {
    job.stop();
  }
  scheduled.clear();

  const tasks = await prisma.task.findMany({
    where: { isEnabled: true, schedule: { not: null } },
  });

  for (const task of tasks) {
    const expr = task.schedule as string;
    if (!cron.validate(expr)) {
      console.warn(
        `[scheduler] invalid cron expression for task ${task.id}: ${expr}`,
      );
      continue;
    }
    const job = cron.schedule(expr, () => {
      startRun(task.id, "schedule").catch((err) =>
        console.error("[scheduler] run failed for task", task.id, err),
      );
    });
    scheduled.set(task.id, job);
    console.log(`[scheduler] scheduled task ${task.id} (${expr})`);
  }
}

export function initScheduler(): void {
  syncSchedules().catch((err) =>
    console.error("[scheduler] initial sync failed", err),
  );
  setInterval(() => {
    syncSchedules().catch((err) =>
      console.error("[scheduler] resync failed", err),
    );
  }, 30_000);
}
