import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { APK_CANDIDATES } from "./paths";

export const dynamic = "force-dynamic";

// Public files are served statically by the host (Vercel CDN, standalone
// copy-standalone-assets). If the file cannot be read from the runtime
// filesystem, redirect to the static URL so the download always works.
const STATIC_PATH = "/apk/mobile-task-automation.apk";

export async function GET(_req: Request) {
  let apkPath: string | null = null;
  let newest: { path: string; mtimeMs: number } | null = null;
  for (const candidate of APK_CANDIDATES) {
    try {
      const s = await stat(candidate.path);
      if (!newest || s.mtimeMs > newest.mtimeMs) {
        newest = { path: candidate.path, mtimeMs: s.mtimeMs };
      }
    } catch {
      // not present, try next
    }
  }
  if (newest) apkPath = newest.path;

  if (!apkPath) {
    return NextResponse.redirect(new URL(STATIC_PATH, new URL(_req.url)));
  }

  try {
    const apk = await readFile(apkPath);
    return new NextResponse(apk, {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="mobile-task-automation.apk"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // Runtime FS read failed (serverless) — serve via the static URL instead.
    return NextResponse.redirect(new URL(STATIC_PATH, new URL(_req.url)));
  }
}