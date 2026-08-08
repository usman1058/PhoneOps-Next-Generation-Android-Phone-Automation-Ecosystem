import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const standaloneWeb = path.join(root, "web/.next/standalone/web");

// Next's standalone output places the app at .next/standalone/web but does
// NOT copy .next/static or public/ — copy them here so the standalone server
// can serve CSS/JS and static assets.
const staticFrom = path.join(root, "web/.next/static");
const staticTo = path.join(standaloneWeb, ".next/static");
if (existsSync(staticFrom)) {
  mkdirSync(path.dirname(staticTo), { recursive: true });
  cpSync(staticFrom, staticTo, { recursive: true });
  console.log("copied .next/static ->", staticTo);
}

const publicFrom = path.join(root, "web/public");
const publicTo = path.join(standaloneWeb, "public");
if (existsSync(publicFrom)) {
  cpSync(publicFrom, publicTo, { recursive: true });
  console.log("copied public ->", publicTo);
}

console.log("standalone assets ready at", standaloneWeb);