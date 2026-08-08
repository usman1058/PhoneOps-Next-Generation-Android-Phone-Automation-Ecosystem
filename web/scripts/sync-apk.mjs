import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const apkOut = path.join(root, "android", "app", "build", "outputs", "apk");
const destDir = path.join(root, "web", "public", "apk");
const destFile = path.join(destDir, "mobile-task-automation.apk");

if (!existsSync(apkOut)) {
  console.error("No Android build output found at", apkOut);
  console.error("Build the APK first (Android Studio: Build > Build APK(s)).");
  process.exit(1);
}

const apks = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full);
    else if (entry.endsWith(".apk") && !entry.includes("androidTest")) {
      apks.push({ full, mtime: s.mtimeMs, size: s.size });
    }
  }
};
walk(apkOut);

if (apks.length === 0) {
  console.error("No .apk files under", apkOut);
  process.exit(1);
}

apks.sort((a, b) => b.mtime - a.mtime);
const latest = apks[0];

const { mkdirSync } = await import("node:fs");
mkdirSync(destDir, { recursive: true });
cpSync(latest.full, destFile, { force: true });

console.log("Synced latest APK ->", destFile);
console.log(`  source: ${latest.full}`);
console.log(`  size:   ${(latest.size / 1_000_000).toFixed(1)} MB`);
console.log(
  `  built:  ${new Date(latest.mtime).toLocaleString()}`,
);
console.log("\nCommit this file and push to redeploy the new APK:");
console.log("  git add web/public/apk && git commit -m \"apk: sync latest build\" && git push");
