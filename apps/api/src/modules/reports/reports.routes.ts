import { Hono } from "hono";
import { requireAuth } from "../../middleware/auth.middleware";
import { getPnL, getDDS, getClientLTV, getCompanySummary, ReportFilters } from "./reports.service";
import type { AppEnv } from "../../types/hono";

export const reportsRouter = new Hono<AppEnv>();
reportsRouter.use(requireAuth);

function parseFilters(query: Record<string, string>): ReportFilters {
  return {
    from: query.from,
    to: query.to,
    projectId: query.projectId,
    clientId: query.clientId,
  };
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
  const result = await getClientLTV(auth.organizationId, c.req.query("clientId"));
  return c.json(result);
});

reportsRouter.get("/summary", async (c) => {
  const auth = c.get("auth");
  const result = await getCompanySummary(auth.organizationId);
  return c.json(result);
});
