import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { seedDemoData, clearDemoData, getDemoStatus } from "./demo.service";
import type { AppEnv } from "../../types/hono";

export const demoRouter = new Hono<AppEnv>();
demoRouter.use(requireAuth);

demoRouter.get("/status", async (c) => {
  const auth = c.get("auth");
  const status = await getDemoStatus(auth.organizationId);
  return c.json(status);
});

demoRouter.post("/seed", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const result = await seedDemoData(auth.organizationId, auth.userId);
  return c.json(result, 201);
});

demoRouter.post("/clear", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const result = await clearDemoData(auth.organizationId);
  return c.json(result);
});
