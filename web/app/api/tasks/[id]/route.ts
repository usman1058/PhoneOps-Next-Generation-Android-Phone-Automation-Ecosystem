import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isSteps } from "@automation/shared";
import { isValidCron } from "@/lib/cron";

const taskPatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    steps: z.array(z.unknown()).optional(),
    schedule: z.string().nullable().optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "at least one field is required",
  });

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task || task.userId !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const device = await prisma.device.findUnique({
    where: { id: task.deviceId },
    select: { id: true, name: true, isOnline: true },
  });
  return NextResponse.json({ ...task, device });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task || task.userId !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = taskPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.steps !== undefined && !isSteps(parsed.data.steps)) {
    return NextResponse.json(
      { error: "steps do not match the step schema" },
      { status: 400 },
    );
  }

  if (
    parsed.data.schedule !== undefined &&
    parsed.data.schedule !== null &&
    !isValidCron(parsed.data.schedule)
  ) {
    return NextResponse.json(
      { error: "schedule must be a valid cron expression" },
      { status: 400 },
    );
  }

  const updated = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.steps !== undefined && { steps: parsed.data.steps }),
      ...(parsed.data.schedule !== undefined && {
        schedule: parsed.data.schedule,
      }),
      ...(parsed.data.isEnabled !== undefined && {
        isEnabled: parsed.data.isEnabled,
      }),
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

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task || task.userId !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.taskRun.deleteMany({ where: { taskId: params.id } }),
    prisma.task.delete({ where: { id: params.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
