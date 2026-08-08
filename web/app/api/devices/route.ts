import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { sha256Hex } from "@automation/shared";
import { relayRequest } from "@/lib/relay-client";

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const apiKey = crypto.randomBytes(32).toString("hex");
  const device = await prisma.device.create({
    data: {
      userId: auth.userId,
      name,
      apiKeyHash: sha256Hex(apiKey),
    },
    select: { id: true, name: true, createdAt: true },
  });

  return NextResponse.json({ ...device, apiKey }, { status: 201 });
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const devices = await prisma.device.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "asc" },
  });

  let online: string[] = [];
  try {
    const res = await relayRequest("/internal/status");
    if (res.ok) {
      const data = (await res.json()) as { devices?: unknown };
      if (Array.isArray(data.devices)) {
        online = data.devices.filter(
          (d): d is string => typeof d === "string",
        );
      }
    }
  } catch {
    // relay unreachable — fall back to persisted isOnline
  }

  return NextResponse.json(
    devices.map((d) => ({
      ...d,
      isOnline: online.includes(d.id) || d.isOnline,
    })),
  );
}
