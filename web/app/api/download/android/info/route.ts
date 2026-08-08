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
    // The APK is committed to web/public/apk/ and served statically (Vercel
    // CDN / standalone). On serverless runtimes public assets may not be
    // readable via fs, so report the bundled copy as available.
    return NextResponse.json({
      available: true,
      kind: "bundled",
      fileName: "mobile-task-automation.apk",
      sizeBytes: null,
      builtAt: null,
    });
  }

  return NextResponse.json({
    available: true,
    kind: found.kind,
    fileName: path.basename(found.path),
    sizeBytes: found.size,
    builtAt: new Date(found.mtimeMs).toISOString(),
  });
}