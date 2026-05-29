import { PrismaClient } from "@prisma/client";

// Cache the client on globalThis so Next.js hot-reload in dev reuses a single
// connection instead of spawning a new PrismaClient on every module reload
// (which exhausts the database's connection pool).
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// Only pin to globalThis outside production; in production each lambda/process
// gets its own short-lived client and the global cache would just leak.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** True when a database is configured; callers use this to degrade gracefully (e.g. demo mode). */
export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}
