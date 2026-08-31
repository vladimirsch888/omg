import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { getPnL, getDDS, getClientLTV, getCompanySummary } from "./reports.service";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function parseFilters(query: any) {
  return {
    from: query.from as string | undefined,
    to: query.to as string | undefined,
    projectId: query.projectId as string | undefined,
    clientId: query.clientId as string | undefined,
  };
}

reportsRouter.get(
  "/pnl",
  asyncHandler(async (req, res) => {
    const result = await getPnL(req.auth!.organizationId, parseFilters(req.query));
    res.json(result);
  })
);

reportsRouter.get(
  "/dds",
  asyncHandler(async (req, res) => {
    const result = await getDDS(req.auth!.organizationId, parseFilters(req.query));
    res.json(result);
  })
);

reportsRouter.get(
  "/ltv",
  asyncHandler(async (req, res) => {
    const result = await getClientLTV(req.auth!.organizationId, req.query.clientId as string | undefined);
    res.json(result);
  })
);

reportsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const result = await getCompanySummary(req.auth!.organizationId);
    res.json(result);
  })
);
