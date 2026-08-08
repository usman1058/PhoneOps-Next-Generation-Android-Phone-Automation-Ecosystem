import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isSteps } from "@automation/shared";
import { isValidCron } from "@/lib/cron";

const taskInputSchema = z.object({
  name: z.string().min(1).max(200),
  deviceId: z.string().min(1),
  steps: z.array(z.unknown()),
  schedule: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = taskInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
  }

  if (!isSteps(parsed.data.steps)) {
    return NextResponse.json(
      { error: "steps do not match the step schema" },
      { status: 400 },
    );
  }

  if (parsed.data.schedule && !isValidCron(parsed.data.schedule)) {
    return NextResponse.json(
      { error: "schedule must be a valid cron expression" },
      { status: 400 },
    );
  }

  const device = await prisma.device.findUnique({
    where: { id: parsed.data.deviceId },
  });
  if (!device || device.userId !== auth.userId) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const task = await prisma.task.create({
    data: {
      userId: auth.userId,
      deviceId: device.id,
      name: parsed.data.name,
      steps: parsed.data.steps,
      schedule: parsed.data.schedule ?? null,
    },
    select: {
      id: true,
      name: true,
      deviceId: true,
      steps: true,
      schedule: true,
      isEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(task, { status: 201 });
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const tasks = await prisma.task.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      deviceId: true,
      steps: true,
      schedule: true,
      isEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(tasks);
}
