import { stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { APK_CANDIDATES } from "../paths";

export const dynamic = "force-dynamic";

export async function GET() {
  let found: { kind: string; path: string; size: number; mtimeMs: number } | null = null;
  for (const candidate of APK_CANDIDATES) {
    try {
      const s = await stat(candidate.path);
      if (!found || s.mtimeMs > found.mtimeMs) {
        found = {
          kind: candidate.kind,
          path: candidate.path,
          size: s.size,
          mtimeMs: s.mtimeMs,
        };
      }
    } catch {
      // try next
    }
  }

  if (!found) {
    return NextResponse.json(
      { error: "Android build artifact not found yet." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    available: true,
    kind: found.kind,
    fileName: path.basename(found.path),
    sizeBytes: found.size,
    builtAt: new Date(found.mtimeMs).toISOString(),
  });
}