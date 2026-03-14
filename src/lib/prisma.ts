// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require("../generated/prisma") as typeof import("../generated/prisma");
import { PrismaPg } from "@prisma/adapter-pg";

type PrismaClientType = InstanceType<typeof PrismaClient>;

function createPrismaClient(): PrismaClientType {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://placeholder:placeholder@localhost:5432/placeholder";
  const adapter = new PrismaPg({ connectionString });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any);
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined;
};

export const prisma: PrismaClientType =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
