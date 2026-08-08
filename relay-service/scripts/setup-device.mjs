import { createRequire } from "node:module";
import crypto from "node:crypto";

process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/automation";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("E:/Projects/React/mobile_task _automate/shared/generated/prisma");

const API_KEY = process.argv[2] ?? "test-api-key-123";
const apiKeyHash = crypto.createHash("sha256").update(API_KEY).digest("hex");

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("no user in DB — register one first");
    process.exit(1);
  }
  let device = await prisma.device.findUnique({ where: { apiKeyHash } });
  if (!device) {
    device = await prisma.device.create({
      data: { name: "Test Pixel", apiKeyHash, userId: user.id },
    });
    console.log("created:", device.id);
  } else {
    console.log("exists:", device.id);
  }
  console.log("API_KEY:", API_KEY);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
