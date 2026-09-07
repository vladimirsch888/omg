import { Hono } from "hono";
import { getLicensePortfolio } from "./licenses.service";
import type { AppEnv } from "../../types/hono";

export const licensesRouter = new Hono<AppEnv>();

licensesRouter.get("/portfolio", async (c) => {
  const auth = c.get("auth");
  return c.json(await getLicensePortfolio(auth.organizationId));
});
