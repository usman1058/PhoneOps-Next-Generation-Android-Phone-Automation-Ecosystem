import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { relayRequest } from "@/lib/relay-client";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task || task.userId !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let res: Response;
  try {
    res = await relayRequest("/internal/run-task", {
      method: "POST",
      body: JSON.stringify({ taskId: task.id, triggeredBy: "manual" }),
    });
  } catch {
    return NextResponse.json(
      { error: "Relay service is unreachable" },
      { status: 503 },
    );
  }

  const data = (await res.json().catch(() => null)) as {
    error?: string;
    runId?: string;
  } | null;

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error ?? "Run failed" },
      { status: res.status },
    );
  }

  return NextResponse.json(data);
}
