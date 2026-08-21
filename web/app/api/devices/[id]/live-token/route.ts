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
    res = await relayRequest(`/internal/panel-token`);
  } catch {
    return NextResponse.json(
      { error: "Relay service is unreachable" },
      { status: 503 },
    );
  }

  const data = (await res.json().catch(() => null)) as {
    token?: string;
    error?: string;
  } | null;

  if (!res.ok || !data?.token) {
    return NextResponse.json(
      { error: data?.error ?? "Failed to create live session" },
      { status: res.status === 200 ? 500 : res.status },
    );
  }

  // The browser needs a URL it can reach directly; NEXT_PUBLIC_RELAY_URL
  // overrides the server-side address when they differ (e.g. LAN vs public).
  const url =
    process.env.NEXT_PUBLIC_RELAY_URL ?? process.env.RELAY_SERVICE_URL ?? "";

  return NextResponse.json({ url, token: data.token });
}
