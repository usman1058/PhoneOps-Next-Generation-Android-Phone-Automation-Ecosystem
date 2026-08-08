import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

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

  const runs = await prisma.taskRun.findMany({
    where: { taskId: params.id },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json(runs);
}
