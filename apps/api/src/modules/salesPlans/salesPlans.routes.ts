import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { getSalesPlanReport, getSalesPlans, saveSalesPlans } from "./salesPlans.service";
import type { AppEnv } from "../../types/hono";

export const salesPlansRouter = new Hono<AppEnv>();
salesPlansRouter.use(requireAuth);

function parseYear(value: string | undefined): number {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : new Date().getFullYear();
}

salesPlansRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const plans = await getSalesPlans(auth.organizationId, parseYear(c.req.query("year")));
  return c.json(plans);
});

// Plan vs fact by month plus the profit mix — everything the План продаж page
// needs, in one request.
salesPlansRouter.get("/report", async (c) => {
  const auth = c.get("auth");
  const report = await getSalesPlanReport(auth.organizationId, parseYear(c.req.query("year")));
  return c.json(report);
});

const saveSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  // null clears a plan; omitting a field leaves it untouched.
  annual: z.number().nonnegative().nullable().optional(),
  months: z
    .array(
      z.object({
        month: z.number().int().min(1).max(12),
        amount: z.number().nonnegative().nullable(),
      })
    )
    .optional(),
});

salesPlansRouter.put("/", async (c) => {
  const auth = c.get("auth");
  const body = saveSchema.parse(await c.req.json());
  const plans = await saveSalesPlans(auth.organizationId, body.year, {
    annual: body.annual,
    months: body.months,
  });
  return c.json(plans);
});
