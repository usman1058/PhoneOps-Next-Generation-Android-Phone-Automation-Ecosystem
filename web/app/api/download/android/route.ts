import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { APK_CANDIDATES } from "./paths";

export const dynamic = "force-dynamic";

export async function GET() {
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
    return NextResponse.json(
      {
        error:
          "Android build artifact not found yet. Build the APK before downloading.",
      },
      { status: 404 },
    );
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
    return NextResponse.json(
      { error: "Failed to read the APK artifact." },
      { status: 500 },
    );
  }
}
