import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, "..");
const root = path.resolve(webDir, "..");

// Vercel sets VERCEL_* during builds; only apply migrations there so ad-hoc
// local builds are never forced to hit the database.
if (!process.env.VERCEL || process.env.VERCEL_ENV === "development") {
  console.log("[prebuild] not a Vercel production build, skipping migrate deploy");
  process.exit(0);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const raw of readFileSync(filePath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(webDir, ".env"));
loadEnvFile(path.join(root, ".env"));

if (!process.env.DATABASE_URL) {
  console.error("[prebuild] DATABASE_URL is not set — cannot apply migrations.");
  process.exit(1);
}

const prismaCli = path.join(
  root,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);
const schema = path.join(root, "shared", "prisma", "schema.prisma");

console.log("[prebuild] applying Prisma migrations against production database...");
try {
  execSync(`node "${prismaCli}" migrate deploy --schema "${schema}"`, {
    stdio: "inherit",
    env: process.env,
  });
  console.log("[prebuild] migrations applied successfully");
} catch (err) {
  console.error("[prebuild] migrate deploy failed:", err.message);
  process.exit(1);
}