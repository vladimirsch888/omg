import { prisma } from "../../prisma";
import { config } from "../../config";
import { startOfDay } from "../../utils/dates";

export interface Reminder {
  kind: "overdue" | "due_soon" | "invoice_stale" | "work_deadline" | "request_high";
  title: string;
  detail: string;
  /** Sorting key: how urgent, days negative = overdue. */
  days: number;
  entity: "subscription" | "sale" | "request";
  entityId: string;
  clientName?: string;
}

/**
 * What needs attention right now. Same rules on the dashboard and in the
 * Telegram digest, so the two never tell a different story:
 *   - active subscription past its due date (overdue renewal);
 *   - active subscription due within 7 days;
 *   - "счёт отправлен" older than 14 days with no payment;
 *   - a WORK sale whose end date is within 3 days or passed, in a project still in work;
 *   - open HIGH-priority client requests.
 */
export async function getReminders(organizationId: string): Promise<Reminder[]> {
  const today = startOfDay(new Date());
  const inWeek = new Date(today);
  inWeek.setDate(inWeek.getDate() + 7);
  const staleInvoiceBefore = new Date(today);
  staleInvoiceBefore.setDate(staleInvoiceBefore.getDate() - 14);
  const workSoon = new Date(today);
  workSoon.setDate(workSoon.getDate() + 3);

  const [subscriptions, sales, requests] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        OR: [{ nextBillingDate: { lt: inWeek } }, { invoiceSentAt: { lt: staleInvoiceBefore } }],
      },
      include: { client: { select: { name: true } }, licenseProduct: { select: { name: true } } },
    }),
    prisma.sale.findMany({
      where: {
        organizationId,
        workEndDate: { not: null, lte: workSoon },
        OR: [{ projectId: null }, { project: { status: "ACTIVE" } }],
        // Only recent jobs: an end date months in the past is history, not a reminder.
        saleDate: { gte: new Date(today.getFullYear(), today.getMonth() - 3, 1) },
      },
      include: { client: { select: { name: true } }, licenseProduct: { select: { name: true } } },
    }),
    prisma.request.findMany({
      where: { organizationId, priority: "HIGH", status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { project: { select: { name: true, client: { select: { name: true } } } } },
    }),
  ]);

  const daysFrom = (d: Date) => Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000);
  const reminders: Reminder[] = [];

  for (const s of subscriptions) {
    const days = daysFrom(s.nextBillingDate);
    if (days < 0) {
      reminders.push({
        kind: "overdue",
        title: `Просрочено продление: ${s.client.name}`,
        detail: `${s.licenseProduct.name}, ${Number(s.price)} ₽ — должно было быть ${formatDate(s.nextBillingDate)} (${-days} дн. назад)`,
        days,
        entity: "subscription",
        entityId: s.id,
        clientName: s.client.name,
      });
    } else if (days <= 7) {
      reminders.push({
        kind: "due_soon",
        title: `Скоро продление: ${s.client.name}`,
        detail: `${s.licenseProduct.name}, ${Number(s.price)} ₽ — ${days === 0 ? "сегодня" : `через ${days} дн.`} (${formatDate(s.nextBillingDate)})`,
        days,
        entity: "subscription",
        entityId: s.id,
        clientName: s.client.name,
      });
    }
    if (s.invoiceSentAt && s.invoiceSentAt < staleInvoiceBefore) {
      const age = -daysFrom(s.invoiceSentAt);
      reminders.push({
        kind: "invoice_stale",
        title: `Счёт не оплачен ${age} дн.: ${s.client.name}`,
        detail: `${s.licenseProduct.name}, ${Number(s.price)} ₽ — счёт отправлен ${formatDate(s.invoiceSentAt)}`,
        days: -age,
        entity: "subscription",
        entityId: s.id,
        clientName: s.client.name,
      });
    }
  }

  for (const sale of sales) {
    const days = daysFrom(sale.workEndDate!);
    reminders.push({
      kind: "work_deadline",
      title: days < 0 ? `Срок работ прошёл: ${sale.client.name}` : `Срок работ ${days === 0 ? "сегодня" : `через ${days} дн.`}: ${sale.client.name}`,
      detail: `${sale.licenseProduct.name} — до ${formatDate(sale.workEndDate!)}`,
      days,
      entity: "sale",
      entityId: sale.id,
      clientName: sale.client.name,
    });
  }

  for (const r of requests) {
    reminders.push({
      kind: "request_high",
      title: `Срочная заявка: ${r.title}`,
      detail: `${r.project.client.name} · ${r.project.name} — открыта ${formatDate(r.createdAt)}`,
      days: daysFrom(r.createdAt),
      entity: "request",
      entityId: r.id,
      clientName: r.project.client.name,
    });
  }

  return reminders.sort((a, b) => a.days - b.days);
}

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/** Plain-text digest for messengers. */
export function formatDigest(organizationName: string, reminders: Reminder[]): string {
  if (reminders.length === 0) return `${organizationName}: на сегодня напоминаний нет ✅`;
  const lines = [`${organizationName} — напоминания на сегодня (${reminders.length}):`, ""];
  const icon: Record<Reminder["kind"], string> = {
    overdue: "🔴",
    due_soon: "🟡",
    invoice_stale: "🧾",
    work_deadline: "⏱",
    request_high: "❗",
  };
  for (const r of reminders.slice(0, 30)) {
    lines.push(`${icon[r.kind]} ${r.title}`);
    lines.push(`    ${r.detail}`);
  }
  if (reminders.length > 30) lines.push(`… и ещё ${reminders.length - 30}`);
  return lines.join("\n");
}

export function telegramConfigured(): boolean {
  return Boolean(config.telegram.botToken && config.telegram.chatId);
}

/** Sends one message through the Bot API; returns false (and logs) on any failure. */
export async function sendTelegram(text: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.telegram.chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.error("telegram sendMessage failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("telegram sendMessage error", err);
    return false;
  }
}

/**
 * Sends every organization its digest. Called by the in-process scheduler
 * once a day at TELEGRAM_DIGEST_HOUR (the bot posts to one chat, so on a
 * single-company installation that's simply "the company's chat").
 */
export async function sendDailyDigests(): Promise<void> {
  if (!telegramConfigured()) return;
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  for (const org of organizations) {
    const reminders = await getReminders(org.id);
    await sendTelegram(formatDigest(org.name, reminders));
  }
}

let lastDigestDay = "";

/**
 * Minute-resolution scheduler: fires the digest the first time the clock
 * passes the configured hour each calendar day. Restart-safe enough for a
 * digest — a restart after the hour simply sends it again once.
 */
export function startDigestScheduler(): void {
  if (!telegramConfigured()) return;
  const tick = async () => {
    const now = new Date();
    const dayKey = now.toDateString();
    if (now.getHours() >= config.telegram.digestHour && lastDigestDay !== dayKey) {
      lastDigestDay = dayKey;
      await sendDailyDigests().catch((err) => console.error("digest failed", err));
    }
  };
  setInterval(tick, 60_000).unref();
  void tick();
}
