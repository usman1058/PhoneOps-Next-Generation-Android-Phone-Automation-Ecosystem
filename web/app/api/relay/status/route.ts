import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { relayRequest } from "@/lib/relay-client";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const res = await relayRequest("/internal/status");
    if (!res.ok) {
      return NextResponse.json({ error: "Relay unreachable" }, { status: 502 });
    }
    const data = (await res.json()) as { devices?: unknown };
    const devices = Array.isArray(data.devices)
      ? data.devices.filter((d): d is string => typeof d === "string")
      : [];
    return NextResponse.json({ devices });
  } catch {
    return NextResponse.json({ error: "Relay unreachable" }, { status: 502 });
  }
}