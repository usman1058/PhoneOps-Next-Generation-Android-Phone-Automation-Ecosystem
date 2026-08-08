import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { sha256Hex } from "@automation/shared";

// Regenerates a device's API key. The old key is immediately invalidated
// (only the hash is stored), and a brand-new plaintext key is returned exactly
// once so the panel can show a fresh pairing QR. The Companion App must be
// re-paired with this new key (the old QR no longer works).
//
// This is the recovery path a user needs when they lose the original key or
// want to re-pair a device that is still registered: instead of deleting and
// re-registering (which would change the device id and orphan its tasks/runs),
// they rotate the key in place.
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const device = await prisma.device.findUnique({ where: { id: params.id } });
  if (!device || device.userId !== auth.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const apiKey = crypto.randomBytes(32).toString("hex");
  await prisma.device.update({
    where: { id: params.id },
    data: { apiKeyHash: sha256Hex(apiKey) },
  });

  return NextResponse.json({
    id: device.id,
    apiKey,
    rotatedAt: new Date().toISOString(),
  });
}