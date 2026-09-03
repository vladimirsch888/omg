import { Hono } from "hono";
import { z } from "zod";
import { parseDateParam } from "../../utils/dates";
import { getPnL, getDDS, getClientLTV, getCompanySummary, getCashPosition, ReportFilters } from "./reports.service";
import type { AppEnv } from "../../types/hono";

export const reportsRouter = new Hono<AppEnv>();

const dateParam = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const d = parseDateParam(v);
    if (d === null) {
      ctx.addIssue({ code: "custom", message: "Некорректная дата в фильтре отчёта" });
      return undefined;
    }
    return d;
  });

const filtersSchema = z.object({
  from: dateParam,
  to: dateParam,
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
});

export function parseFilters(query: Record<string, string>): ReportFilters {
  const q = filtersSchema.parse(query);
  return { from: q.from, to: q.to, projectId: q.projectId, clientId: q.clientId };
}

reportsRouter.get("/pnl", async (c) => {
  const auth = c.get("auth");
  const result = await getPnL(auth.organizationId, parseFilters(c.req.query()));
  return c.json(result);
});

reportsRouter.get("/dds", async (c) => {
  const auth = c.get("auth");
  const result = await getDDS(auth.organizationId, parseFilters(c.req.query()));
  return c.json(result);
});

reportsRouter.get("/ltv", async (c) => {
  const auth = c.get("auth");
  const clientId = z.string().uuid().optional().parse(c.req.query("clientId") || undefined);
  const result = await getClientLTV(auth.organizationId, clientId);
  return c.json(result);
});

reportsRouter.get("/summary", async (c) => {
  const auth = c.get("auth");
  const result = await getCompanySummary(auth.organizationId);
  return c.json(result);
});

reportsRouter.get("/cash-position", async (c) => {
  const auth = c.get("auth");
  const result = await getCashPosition(auth.organizationId);
  return c.json(result);
});
