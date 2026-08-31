import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { config } from "./config";
import { AppError } from "./utils/errors";
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
import type { AppEnv } from "./types/hono";

export const app = new Hono<AppEnv>();

app.use("*", cors({ origin: config.corsOrigin }));

app.get("/health", (c) => c.json({ ok: true, version: 1 }));

app.route("/api/auth", authRouter);
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

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.status as any);
  }
  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? "Некорректные данные";
    return c.json({ error: message }, 400);
  }
  console.error(err);
  return c.json({ error: "Внутренняя ошибка сервера" }, 500);
});
