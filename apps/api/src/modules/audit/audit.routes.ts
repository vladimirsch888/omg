import { Hono } from "hono";
import { z } from "zod";
import { requireRole } from "../../middleware/auth.middleware";
import { listAuditLog } from "./audit.service";
import type { AppEnv } from "../../types/hono";

export const auditRouter = new Hono<AppEnv>();

const querySchema = z.object({
  entity: z.string().trim().max(50).optional(),
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** The change journal is for owners and admins — it names who did what. */
auditRouter.get("/", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const q = querySchema.parse(c.req.query());
  return c.json(await listAuditLog(auth.organizationId, q));
});
