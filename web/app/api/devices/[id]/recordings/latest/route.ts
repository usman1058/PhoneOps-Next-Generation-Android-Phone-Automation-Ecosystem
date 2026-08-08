import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { relayRequest } from "@/lib/relay-client";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const device = await prisma.device.findUnique({ where: { id: params.id } });
  if (!device || device.userId !== auth.userId) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  let res: Response;
  try {
    res = await relayRequest(`/internal/devices/${device.id}/latest-recording`);
  } catch {
    return NextResponse.json(
      { error: "Relay service is unreachable" },
      { status: 503 },
    );
  }

  const data = (await res.json().catch(() => null)) as {
    error?: string;
    steps?: unknown;
  } | null;

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error ?? "No recording available" },
      { status: res.status },
    );
  }

  return NextResponse.json(data);
}
