import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "./config";

// Rust-free client (Prisma ORM 7): queries run through the `pg` driver
// directly via the adapter instead of spawning a separate Rust query-engine
// process. This meaningfully cuts memory usage and startup time, which
// matters on a small VPS.
const adapter = new PrismaPg({ connectionString: config.databaseUrl });

export const prisma = new PrismaClient({ adapter });
