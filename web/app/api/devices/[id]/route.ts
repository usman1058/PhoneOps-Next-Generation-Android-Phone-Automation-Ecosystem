import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const device = await prisma.device.findUnique({ where: { id: params.id } });
  if (!device || device.userId !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tasks = await prisma.task.findMany({
    where: { deviceId: params.id, userId: auth.userId },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.taskRun.deleteMany({
      where: { deviceId: params.id },
    }),
    prisma.task.deleteMany({
      where: { id: { in: tasks.map((t) => t.id) } },
    }),
    prisma.device.delete({ where: { id: params.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
