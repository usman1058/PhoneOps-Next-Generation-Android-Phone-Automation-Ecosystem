import fs from "node:fs";
import path from "node:path";

/**
 * Resolve the real project `android` folder regardless of whether we're
 * running from `next dev` (cwd = web/) or the standalone server
 * (cwd = web/.next/standalone/web). We walk up from process.cwd() to find
 * the real repo root (identified by a `relay-service` directory alongside
 * `android/app/build`) so we serve the live APK and not the stale copy
 * baked into the standalone bundle.
 */
function findSourceAndroidDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const hasAndroidBuild = fs.existsSync(path.join(dir, "android", "app", "build"));
    const isRealRepo = fs.existsSync(path.join(dir, "relay-service")) ||
      fs.existsSync(path.join(dir, "docker-compose.yml"));
    if (hasAndroidBuild && isRealRepo) {
      return path.join(dir, "android");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const androidDir = findSourceAndroidDir();

export const APK_CANDIDATES = [
  {
    kind: "release",
    path: androidDir
      ? path.join(
          androidDir,
          "app",
          "build",
          "outputs",
          "apk",
          "release",
          "app-release-unsigned.apk",
        )
      : "",
  },
  {
    kind: "debug",
    path: androidDir
      ? path.join(
          androidDir,
          "app",
          "build",
          "outputs",
          "apk",
          "debug",
          "app-debug.apk",
        )
      : "",
  },
].filter((c) => c.path !== "");