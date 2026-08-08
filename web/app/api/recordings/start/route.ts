import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { relayRequest } from "@/lib/relay-client";

const startRecordingSchema = z.object({
  deviceId: z.string().min(1),
});

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = startRecordingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }

  const device = await prisma.device.findUnique({
    where: { id: parsed.data.deviceId },
  });
  if (!device || device.userId !== auth.userId) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  let res: Response;
  try {
    res = await relayRequest("/internal/start-recording", {
      method: "POST",
      body: JSON.stringify({ deviceId: device.id }),
    });
  } catch {
    return NextResponse.json(
      { error: "Relay service is unreachable" },
      { status: 503 },
    );
  }

  const data = (await res.json().catch(() => null)) as {
    error?: string;
    sessionId?: string;
  } | null;

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error ?? "Start recording failed" },
      { status: res.status },
    );
  }

  return NextResponse.json(data, { status: 201 });
}
