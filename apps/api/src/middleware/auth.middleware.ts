import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/hono";
import { verifyToken } from "../utils/jwt";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: "Не авторизован" }, 401);
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = await verifyToken(token);
    c.set("auth", payload);
    await next();
  } catch {
    return c.json({ error: "Недействительный токен" }, 401);
  }
});

export function requireRole(...roles: string[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const auth = c.get("auth");
    if (!auth || !roles.includes(auth.role)) {
      return c.json({ error: "Недостаточно прав" }, 403);
    }
    await next();
  });
}
