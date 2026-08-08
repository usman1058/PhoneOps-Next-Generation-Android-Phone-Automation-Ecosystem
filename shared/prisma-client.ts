import { PrismaClient } from "./generated/prisma";

export { PrismaClient } from "./generated/prisma";

const globalForPrisma = globalThis as unknown as {
  __automationPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.__automationPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__automationPrisma = prisma;
}
