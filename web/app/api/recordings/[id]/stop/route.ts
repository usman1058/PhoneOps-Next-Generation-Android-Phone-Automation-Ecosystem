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

  const sessionId = params.id;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await relayRequest("/internal/stop-recording", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
  } catch {
    return NextResponse.json(
      { error: "Relay service is unreachable" },
      { status: 503 },
    );
  }

  const data = (await res.json().catch(() => null)) as {
    error?: string;
    steps?: unknown[];
  } | null;

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error ?? "Stop recording failed" },
      { status: res.status },
    );
  }

  return NextResponse.json({ sessionId, steps: data?.steps ?? [] });
}
