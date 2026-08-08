import fs from "node:fs";
import path from "node:path";

/**
 * The APK we serve must exist inside the deployment bundle, so it is synced
 * into `web/public/apk/` (committed to the repo; Vercel/standalone ship it).
 * Local Android build outputs are used only as a fallback when running from a
 * dev checkout where the bundled copy is stale.
 */
function findWebDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "public", "apk"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findAndroidDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const hasAndroidBuild = fs.existsSync(path.join(dir, "android", "app", "build"));
    if (hasAndroidBuild) {
      return path.join(dir, "android");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const webDir = findWebDir();
const androidDir = findAndroidDir();

export const APK_CANDIDATES = [
  // Bundled copy that ships with the deployment — always present on Vercel.
  {
    kind: "bundled",
    path: webDir
      ? path.join(webDir, "public", "apk", "mobile-task-automation.apk")
      : "",
  },
  // Local Android build outputs — fallback for dev checkouts.
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