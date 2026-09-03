import { Hono } from "hono";
import { requireRole } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import { audit } from "../audit/audit.service";
import { seedDemoData, clearDemoData, getDemoStatus } from "./demo.service";
import type { AppEnv } from "../../types/hono";

export const demoRouter = new Hono<AppEnv>();

demoRouter.get("/status", async (c) => {
  const auth = c.get("auth");
  const status = await getDemoStatus(auth.organizationId);
  return c.json(status);
});

demoRouter.post("/seed", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  // Seeding twice would double every demo client and product.
  const status = await getDemoStatus(auth.organizationId);
  if (status.hasDemoData) {
    throw new AppError(409, "Демо-данные уже добавлены. Сначала удалите их, затем наполните заново.");
  }
  const result = await seedDemoData(auth.organizationId, auth.userId);
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "seed", entity: "demo", summary: "Добавлены демо-данные" });
  return c.json(result, 201);
});

demoRouter.post("/clear", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const result = await clearDemoData(auth.organizationId);
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "clear", entity: "demo", summary: "Удалены демо-данные" });
  return c.json(result);
});
