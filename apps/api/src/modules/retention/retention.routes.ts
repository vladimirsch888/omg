import { Hono } from "hono";
import { z } from "zod";
import { getRetentionReport } from "./retention.service";
import type { AppEnv } from "../../types/hono";

export const retentionRouter = new Hono<AppEnv>();

retentionRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const months = z.coerce.number().int().min(3).max(36).default(12).parse(c.req.query("months") ?? undefined);
  return c.json(await getRetentionReport(auth.organizationId, months));
});
