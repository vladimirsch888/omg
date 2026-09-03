import { Hono } from "hono";
import { z } from "zod";
import { AppError } from "../../utils/errors";
import { audit } from "../audit/audit.service";
import { getSalesPlanReport, getSalesPlans, saveSalesPlans } from "./salesPlans.service";
import type { AppEnv } from "../../types/hono";

export const salesPlansRouter = new Hono<AppEnv>();

/** No year → current year; a year outside the supported range is an error, not a silent substitute. */
function parseYear(value: string | undefined): number {
  if (value === undefined || value === "") return new Date().getFullYear();
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError(400, "Год должен быть в диапазоне 2000–2100");
  }
  return year;
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
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "salesPlan", summary: `Сохранены планы продаж на ${body.year} год` });
  return c.json(plans);
});
