import { Hono } from "hono";
import { prisma } from "../../prisma";
import { requireRole } from "../../middleware/auth.middleware";
import { AppError } from "../../utils/errors";
import { formatDigest, getReminders, sendTelegram, telegramConfigured } from "./reminders.service";
import type { AppEnv } from "../../types/hono";

export const remindersRouter = new Hono<AppEnv>();

remindersRouter.get("/", async (c) => {
  const auth = c.get("auth");
  const reminders = await getReminders(auth.organizationId);
  return c.json({ reminders, telegramConfigured: telegramConfigured() });
});

/** "Отправить сейчас" — proves the bot wiring works without waiting for the morning. */
remindersRouter.post("/telegram/send", requireRole("OWNER", "ADMIN"), async (c) => {
  const auth = c.get("auth");
  if (!telegramConfigured()) {
    throw new AppError(400, "Telegram не настроен: задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env сервера");
  }
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } });
  const reminders = await getReminders(auth.organizationId);
  const sent = await sendTelegram(formatDigest(organization.name, reminders));
  if (!sent) throw new AppError(502, "Telegram не принял сообщение — проверьте токен бота и chat id");
  return c.json({ sent: true, count: reminders.length });
});
