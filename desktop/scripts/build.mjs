import { execSync } from "node:child_process";
import { cpSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const webDir = path.join(root, "web");
const standalone = path.join(webDir, ".next", "standalone", "web");
const distDir = path.join(root, "desktop", "dist", "server");

console.log("[build] next build (standalone)...");
const env = { ...process.env };
// Workaround: Node on Windows throws EPERM scanning the "Application Data"
// junction under the user's home dir, which breaks webpack file tracing.
const fakeHome = path.join(process.env.TEMP ?? ".", "opencode", "fakehome");
env.USERPROFILE = fakeHome;
env.HOME = fakeHome;
env.APPDATA = path.join(fakeHome, "AppData", "Roaming");
env.LOCALAPPDATA = path.join(fakeHome, "AppData", "Local");
env.NEXT_TELEMETRY_DISABLED = "1";
// Invoke the next CLI directly with node. Running `npx next build` makes npm
// write a debug log under the fake home, which Next's standalone file tracing
// picks up and fails to copy (ENOENT mkdir ...npm-cache\_logs).
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
execSync(`node "${nextBin}" build`, { cwd: webDir, env, stdio: "inherit" });

console.log("[build] staging standalone server...");
rmSync(distDir, { recursive: true, force: true });
cpSync(standalone, distDir, { recursive: true });
cpSync(
  path.join(webDir, ".next", "static"),
  path.join(distDir, ".next", "static"),
  { recursive: true },
);

// bcrypt ships prebuilt binaries outside the traced node_modules; copy them
// so password login works in the packaged server (mirrors web standalone fix).
const rootNodeModules = path.join(root, "node_modules");
const bcryptPrebuilds = path.join(rootNodeModules, "bcrypt", "prebuilds");
const bcryptDest = path.join(distDir, "node_modules", "bcrypt", "prebuilds");
if (existsSync(bcryptPrebuilds)) {
  cpSync(bcryptPrebuilds, bcryptDest, { recursive: true });
  console.log("[build] copied bcrypt prebuilds into packaged server");
}

console.log(`[build] done -> ${distDir}`);
