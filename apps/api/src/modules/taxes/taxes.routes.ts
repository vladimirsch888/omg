import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../prisma";
import { requireRole } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import { assertDictionaryValue } from "../../utils/ownership";
import { audit } from "../audit/audit.service";
import { getTaxCalendar, getTaxProfile, recordTaxPayment } from "./taxes.service";
import type { AppEnv } from "../../types/hono";

export const taxesRouter = new Hono<AppEnv>();

function parseYear(value: string | undefined): number {
  if (!value) return new Date().getFullYear();
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AppError(400, "Год должен быть в диапазоне 2000–2100");
  return year;
}

taxesRouter.get("/profile", async (c) => {
  const auth = c.get("auth");
  return c.json(await getTaxProfile(auth.organizationId));
});

const profileSchema = z.object({
  form: z.enum(["IP", "OOO"]),
  regime: z.enum(["USN_INCOME", "USN_INCOME_EXPENSE"]),
  ratePercent: z.number().min(0).max(30),
  minimumTaxPercent: z.number().min(0).max(10).default(1),
  fixedContributions: z.number().min(0).max(10_000_000).default(0),
  onePercentThreshold: z.number().min(0).max(100_000_000).default(300_000),
  onePercentCap: z.number().min(0).max(10_000_000).default(0),
  deductFixedWhenDue: z.boolean().default(true),
  hasEmployees: z.boolean().default(false),
  vatThreshold: z.number().min(0).max(1_000_000_000).optional().nullable(),
});

taxesRouter.put("/profile", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  const body = profileSchema.parse(await c.req.json());
  const data = { ...body, vatThreshold: body.vatThreshold ?? null };
  const profile = await prisma.taxProfile.upsert({
    where: { organizationId: auth.organizationId },
    create: { organizationId: auth.organizationId, ...data },
    update: data,
  });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "update", entity: "taxProfile", entityId: profile.id, summary: `Налоговый профиль: ${body.form}, ${body.regime === "USN_INCOME" ? "УСН доходы" : "УСН доходы − расходы"} ${body.ratePercent} %` });
  return c.json(await getTaxProfile(auth.organizationId));
});

taxesRouter.get("/calendar", async (c) => {
  const auth = c.get("auth");
  return c.json(await getTaxCalendar(auth.organizationId, parseYear(c.req.query("year"))));
});

const paySchema = z.object({
  kind: z.enum(["usn_advance", "usn_annual", "ip_fixed", "ip_one_percent"]),
  period: z.string().min(4).max(20),
  amount: z.number().positive(),
  date: z.string().datetime(),
  accountValueId: z.string().uuid().optional().nullable(),
  title: z.string().trim().max(200).optional(),
});

/** "Оплачено" on a calendar row: books the expense and links it to the obligation. */
taxesRouter.post("/pay", async (c) => {
  const auth = c.get("auth");
  const body = paySchema.parse(await c.req.json());
  if (body.accountValueId) await assertDictionaryValue(auth.organizationId, body.accountValueId, "account", "Счёт");
  const operation = await recordTaxPayment({
    organizationId: auth.organizationId,
    userId: auth.userId,
    kind: body.kind,
    period: body.period,
    amount: body.amount,
    date: new Date(body.date),
    accountValueId: body.accountValueId ?? null,
    title: body.title ?? `Уплата налога (${body.period})`,
  });
  audit({ organizationId: auth.organizationId, userId: auth.userId, action: "create", entity: "operation", entityId: operation.id, summary: `Уплачен налог: ${body.title ?? body.period}, ${body.amount} ₽` });
  return c.json(operation, 201);
});
