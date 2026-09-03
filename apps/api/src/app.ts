import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { ZodError } from "zod";
import { config } from "./config";
import { AppError } from "./utils/errors";
import { requireAuth, blockViewerWrites } from "./middleware/auth.middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { clientsRouter } from "./modules/clients/clients.routes";
import { projectsRouter } from "./modules/projects/projects.routes";
import { dictionariesRouter } from "./modules/dictionaries/dictionaries.routes";
import { operationsRouter } from "./modules/operations/operations.routes";
import { requestsRouter } from "./modules/requests/requests.routes";
import { timeEntriesRouter } from "./modules/timeEntries/timeEntries.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { demoRouter } from "./modules/demo/demo.routes";
import { licenseProductsRouter } from "./modules/licenseProducts/licenseProducts.routes";
import { subscriptionsRouter } from "./modules/subscriptions/subscriptions.routes";
import { salesRouter } from "./modules/sales/sales.routes";
import { salesPlansRouter } from "./modules/salesPlans/salesPlans.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { exportRouter } from "./modules/export/export.routes";
import { remindersRouter } from "./modules/reminders/reminders.routes";
import type { AppEnv } from "./types/hono";

export const app = new Hono<AppEnv>();

app.use("*", cors({ origin: config.corsOrigin }));
// Clickjacking / MIME-sniffing / referrer defaults. Set BEFORE the handler
// runs (c.header, not c.res.headers after next): @hono/node-server serves
// c.json() responses through a fast path that snapshots the headers at
// creation, so anything added to c.res afterwards never reaches the wire.
// HSTS is added by Nginx only once TLS is on, so it isn't set here.
const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Permitted-Cross-Domain-Policies", "none");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Cache-Control", "no-store");
  await next();
});
app.use("*", securityHeaders);

app.get("/health", (c) => c.json({ ok: true, version: 2 }));
app.get("/api/health", (c) => c.json({ ok: true, version: 2 }));

app.route("/api/auth", authRouter);

// Everything below requires a signed-in user; the VIEWER role can only read.
app.use("/api/*", requireAuth);
app.use("/api/*", blockViewerWrites);

app.route("/api/users", usersRouter);
app.route("/api/clients", clientsRouter);
app.route("/api/projects", projectsRouter);
app.route("/api/dictionaries", dictionariesRouter);
app.route("/api/operations", operationsRouter);
app.route("/api/requests", requestsRouter);
app.route("/api/time-entries", timeEntriesRouter);
app.route("/api/reports", reportsRouter);
app.route("/api/demo", demoRouter);
app.route("/api/license-products", licenseProductsRouter);
app.route("/api/subscriptions", subscriptionsRouter);
app.route("/api/sales", salesRouter);
app.route("/api/sales-plans", salesPlansRouter);
app.route("/api/audit", auditRouter);
app.route("/api/export", exportRouter);
app.route("/api/reminders", remindersRouter);

app.notFound((c) => c.json({ error: "Не найдено" }, 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.status as any);
  }
  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? "Некорректные данные";
    return c.json({ error: message }, 400);
  }
  // A body that isn't JSON at all (c.req.json() throws a SyntaxError).
  if (err instanceof SyntaxError) {
    return c.json({ error: "Тело запроса должно быть корректным JSON" }, 400);
  }
  // Prisma's known request errors carry a code; the common ones map to
  // clean HTTP answers instead of a 500 with a stack trace in the log.
  const code = (err as { code?: string }).code;
  if (code === "P2002") return c.json({ error: "Такая запись уже существует (нарушена уникальность)" }, 409);
  if (code === "P2003") return c.json({ error: "Ссылка на несуществующую или чужую запись" }, 400);
  if (code === "P2025") return c.json({ error: "Запись не найдена" }, 404);
  console.error(err);
  return c.json({ error: "Внутренняя ошибка сервера" }, 500);
});
