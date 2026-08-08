import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { relayRequest } from "@/lib/relay-client";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const [devices, tasks, runs] = await Promise.all([
    prisma.device.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        isOnline: true,
        lastSeenAt: true,
      },
    }),
    prisma.task.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        deviceId: true,
        isEnabled: true,
        schedule: true,
        createdAt: true,
        steps: true,
      },
    }),
    prisma.taskRun.findMany({
      where: { task: { userId: auth.userId } },
      orderBy: { startedAt: "desc" },
      take: 8,
      select: {
        id: true,
        taskId: true,
        deviceId: true,
        status: true,
        triggeredBy: true,
        startedAt: true,
        finishedAt: true,
        stepResults: true,
        task: { select: { name: true } },
        device: { select: { name: true } },
      },
    }),
  ]);

  let onlineDeviceIds: string[] = [];
  try {
    const relayRes = await relayRequest("/internal/status");
    if (relayRes.ok) {
      const data = (await relayRes.json()) as { devices?: unknown };
      if (Array.isArray(data.devices)) {
        onlineDeviceIds = data.devices.filter((id): id is string => typeof id === "string");
      }
    }
  } catch {
    // fall back to persisted status
  }

  return NextResponse.json({
    counts: {
      devices: devices.length,
      tasks: tasks.length,
      runs: runs.length,
    },
    devices: devices.map((device) => ({
      ...device,
      isOnline: device.isOnline || onlineDeviceIds.includes(device.id),
    })),
    tasks,
    runs,
  });
}
