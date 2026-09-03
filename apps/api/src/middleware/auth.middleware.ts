import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/hono";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../prisma";

/**
 * Authenticates the request AND re-checks the user against the database on
 * every call: a deactivated user, a changed role or a bumped tokenVersion
 * ("log out everywhere", password change) take effect immediately instead of
 * whenever the 7-day token happens to expire. One indexed primary-key lookup
 * per request is the price, and it's a cheap one.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: "Не авторизован" }, 401);
  }
  const token = header.slice("Bearer ".length);
  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    return c.json({ error: "Недействительный токен" }, 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, organizationId: true, role: true, isActive: true, tokenVersion: true },
  });
  if (!user || !user.isActive || user.organizationId !== payload.organizationId) {
    return c.json({ error: "Доступ отключён" }, 401);
  }
  if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
    return c.json({ error: "Сессия завершена. Войдите заново" }, 401);
  }

  // The role comes from the database, never from the token — so a demotion
  // applies to the very next request.
  c.set("auth", { ...payload, role: user.role });
  await next();
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

/**
 * VIEWER is read-only: every mutating request under /api is rejected for it
 * here in one place, so no individual route can forget. Mounted in app.ts
 * after requireAuth-bearing routers set `auth`; unauthenticated requests are
 * already gone by then.
 */
export const blockViewerWrites = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  const auth = c.get("auth");
  if (auth && auth.role === "VIEWER") {
    return c.json({ error: "Роль «Наблюдатель» — только просмотр" }, 403);
  }
  await next();
});
