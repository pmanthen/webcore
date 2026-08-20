import { PrismaClient } from "@prisma/client";

/**
 * Prevents exhausting the connection pool during Next.js hot reload
 * by reusing a single PrismaClient on `globalThis` in development.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  __autonomousUxPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__autonomousUxPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__autonomousUxPrisma = prisma;
}

export { PrismaClient };
