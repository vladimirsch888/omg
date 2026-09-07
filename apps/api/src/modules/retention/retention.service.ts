import { prisma } from "../../prisma";
import { startOfDay, startOfMonth } from "../../utils/dates";

export interface CohortRow {
  cohort: string;
  /** Subscriptions / MRR / clients the cohort started with. */
  size: number;
  mrr: number;
  clients: number;
  /** Retention per month of life (index 0 = starting month), as a share 0..1; null = not reached yet. */
  bySubscriptions: (number | null)[];
  byMrr: (number | null)[];
  byClients: (number | null)[];
}

export interface RetentionReport {
  months: number;
  cohorts: CohortRow[];
  monthly: {
    month: string;
    activeStart: number;
    started: number;
    cancelled: number;
    churnRate: number | null;
    mrrStart: number;
    mrrLost: number;
    mrrChurnRate: number | null;
    /** Renewals: due in the month → how many were billed, and how late. */
    renewalsDue: number;
    renewedOnTime: number;
    renewedLate: number;
    notRenewed: number;
    averageDelayDays: number | null;
  }[];
  summary: {
    activeNow: number;
    cancelledLast12m: number;
    churnRate12m: number | null;
    averageLifetimeMonths: number | null;
    onTimeRenewalShare: number | null;
    lateRenewals30: number;
  };
  reasons: { reason: string; count: number; mrrLost: number }[];
  churned: {
    subscriptionId: string;
    clientName: string;
    productName: string;
    cancelledAt: Date;
    lifetimeMonths: number;
    mrr: number;
    reason: string | null;
    comment: string | null;
  }[];
}

export interface RetentionSubscription {
  id: string;
  clientId: string;
  clientName: string;
  productName: string;
  price: number;
  durationMonths: number;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  startDate: Date;
  cancelledAt: Date | null;
  reason: string | null;
  comment: string | null;
  billings: Date[];
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthsBetween = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

/** Alive during month M: started on/before M's end and not cancelled before M's start. */
function aliveIn(sub: RetentionSubscription, month: Date): boolean {
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  if (sub.startDate >= monthEnd) return false;
  if (sub.status === "CANCELLED" && sub.cancelledAt && sub.cancelledAt < month) return false;
  return true;
}

/**
 * Churn, retention by cohort and renewal discipline, computed from the
 * subscriptions and their billing history — no separate table to keep in
 * sync. Cohort = month the subscription started; a subscription counts as
 * alive until its cancelledAt (paused ones stay alive).
 */
export async function getRetentionReport(organizationId: string, months = 12): Promise<RetentionReport> {
  const raw = await prisma.subscription.findMany({
    where: { organizationId },
    include: {
      client: { select: { id: true, name: true } },
      licenseProduct: { select: { name: true } },
      cancelReasonValue: { select: { name: true } },
      operations: { where: { type: "INCOME" }, select: { accrualDate: true }, orderBy: { accrualDate: "asc" } },
    },
  });
  const subs: RetentionSubscription[] = raw.map((s) => ({
    id: s.id,
    clientId: s.client.id,
    clientName: s.client.name,
    productName: s.licenseProduct.name,
    price: Number(s.price),
    durationMonths: s.durationMonths,
    status: s.status,
    startDate: s.startDate,
    cancelledAt: s.cancelledAt,
    reason: s.cancelReasonValue?.name ?? null,
    comment: s.cancelComment,
    billings: s.operations.map((o) => o.accrualDate),
  }));
  return computeRetention(subs, months);
}

/** The pure part of the report, on subscriptions already loaded. */
export function computeRetention(subs: RetentionSubscription[], months: number, now = new Date()): RetentionReport {
  const today = startOfDay(now);
  const currentMonth = startOfMonth(today);
  const firstMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - (months - 1), 1);
  const mrrOf = (s: RetentionSubscription) => s.price / s.durationMonths;

  // ---- cohorts
  const cohorts: CohortRow[] = [];
  for (let i = 0; i < months; i++) {
    const cohortMonth = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + i, 1);
    const key = monthKey(cohortMonth);
    const members = subs.filter((s) => monthKey(s.startDate) === key);
    if (members.length === 0) continue;
    const size = members.length;
    const mrr = members.reduce((sum, s) => sum + mrrOf(s), 0);
    const clientIds = new Set(members.map((s) => s.clientId));
    const bySubscriptions: (number | null)[] = [];
    const byMrr: (number | null)[] = [];
    const byClients: (number | null)[] = [];
    for (let life = 0; life < months; life++) {
      const month = new Date(cohortMonth.getFullYear(), cohortMonth.getMonth() + life, 1);
      if (month > currentMonth) {
        bySubscriptions.push(null);
        byMrr.push(null);
        byClients.push(null);
        continue;
      }
      const alive = members.filter((s) => aliveIn(s, month));
      bySubscriptions.push(alive.length / size);
      byMrr.push(mrr > 0 ? alive.reduce((sum, s) => sum + mrrOf(s), 0) / mrr : null);
      byClients.push(new Set(alive.map((s) => s.clientId)).size / clientIds.size);
    }
    cohorts.push({ cohort: key, size, mrr, clients: clientIds.size, bySubscriptions, byMrr, byClients });
  }

  // ---- month by month: churn and renewals
  const monthly: RetentionReport["monthly"] = [];
  for (let i = 0; i < months; i++) {
    const month = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + i, 1);
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const key = monthKey(month);
    const activeStart = subs.filter((s) => s.startDate < month && aliveIn(s, month) && !(s.status === "CANCELLED" && s.cancelledAt && s.cancelledAt < month));
    const cancelled = subs.filter((s) => s.status === "CANCELLED" && s.cancelledAt && s.cancelledAt >= month && s.cancelledAt < monthEnd);
    const started = subs.filter((s) => monthKey(s.startDate) === key);
    const mrrStart = activeStart.reduce((sum, s) => sum + mrrOf(s), 0);
    const mrrLost = cancelled.reduce((sum, s) => sum + mrrOf(s), 0);

    // Renewals due in this month: walk each subscription's schedule and see
    // whether a billing landed for that due date and how late it came.
    let renewalsDue = 0;
    let renewedOnTime = 0;
    let renewedLate = 0;
    let notRenewed = 0;
    const delays: number[] = [];
    for (const s of subs) {
      // Due dates are the billing dates after the first one, in this month.
      const dues = s.billings.slice(1).filter((d) => d >= month && d < monthEnd);
      // Plus the scheduled-but-unpaid date if it fell in this month and is in the past.
      for (const billed of dues) {
        renewalsDue++;
        // The scheduled date is unknown once billed; approximate lateness by
        // distance from the previous billing + duration.
        const idx = s.billings.indexOf(billed);
        const previous = s.billings[idx - 1];
        const scheduled = new Date(previous);
        scheduled.setMonth(scheduled.getMonth() + s.durationMonths);
        const delay = Math.round((startOfDay(billed).getTime() - startOfDay(scheduled).getTime()) / 86_400_000);
        delays.push(Math.max(0, delay));
        if (delay <= 3) renewedOnTime++;
        else renewedLate++;
      }
      if (s.status === "ACTIVE" && month < currentMonth) {
        // A due date in a past month that was never billed → not renewed (still overdue).
        const last = s.billings[s.billings.length - 1];
        if (last) {
          const scheduled = new Date(last);
          scheduled.setMonth(scheduled.getMonth() + s.durationMonths);
          if (scheduled >= month && scheduled < monthEnd && scheduled < today) {
            renewalsDue++;
            notRenewed++;
          }
        }
      }
    }
    monthly.push({
      month: key,
      activeStart: activeStart.length,
      started: started.length,
      cancelled: cancelled.length,
      churnRate: activeStart.length > 0 ? cancelled.length / activeStart.length : null,
      mrrStart,
      mrrLost,
      mrrChurnRate: mrrStart > 0 ? mrrLost / mrrStart : null,
      renewalsDue,
      renewedOnTime,
      renewedLate,
      notRenewed,
      averageDelayDays: delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    });
  }

  // ---- summary, reasons, churned list
  const yearAgo = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 11, 1);
  const churnedLast12 = subs.filter((s) => s.status === "CANCELLED" && s.cancelledAt && s.cancelledAt >= yearAgo);
  // Churn base: everything that was alive a year ago plus everything that
  // started since — a young portfolio would otherwise have no base at all.
  const churnBase = subs.filter((s) => (s.startDate < yearAgo && aliveIn(s, yearAgo)) || s.startDate >= yearAgo).length;
  const lifetimes = subs
    .filter((s) => s.status === "CANCELLED" && s.cancelledAt)
    .map((s) => Math.max(1, monthsBetween(s.startDate, s.cancelledAt!)));
  const totalDue = monthly.reduce((sum, m) => sum + m.renewalsDue, 0);
  const totalOnTime = monthly.reduce((sum, m) => sum + m.renewedOnTime, 0);

  const reasonsMap = new Map<string, { count: number; mrrLost: number }>();
  for (const s of churnedLast12) {
    const key = s.reason ?? "Причина не указана";
    const r = reasonsMap.get(key) ?? { count: 0, mrrLost: 0 };
    r.count++;
    r.mrrLost += mrrOf(s);
    reasonsMap.set(key, r);
  }

  return {
    months,
    cohorts,
    monthly,
    summary: {
      activeNow: subs.filter((s) => s.status === "ACTIVE").length,
      cancelledLast12m: churnedLast12.length,
      churnRate12m: churnBase > 0 ? churnedLast12.length / churnBase : null,
      averageLifetimeMonths: lifetimes.length > 0 ? Math.round((lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length) * 10) / 10 : null,
      onTimeRenewalShare: totalDue > 0 ? totalOnTime / totalDue : null,
      lateRenewals30: subs.filter((s) => {
        if (s.status !== "ACTIVE") return false;
        return (today.getTime() - startOfDay(s.billings[s.billings.length - 1] ?? s.startDate).getTime()) / 86_400_000 > s.durationMonths * 30.4 + 30;
      }).length,
    },
    reasons: [...reasonsMap].map(([reason, r]) => ({ reason, ...r })).sort((a, b) => b.count - a.count),
    churned: subs
      .filter((s) => s.status === "CANCELLED" && s.cancelledAt)
      .sort((a, b) => b.cancelledAt!.getTime() - a.cancelledAt!.getTime())
      .slice(0, 50)
      .map((s) => ({
        subscriptionId: s.id,
        clientName: s.clientName,
        productName: s.productName,
        cancelledAt: s.cancelledAt!,
        lifetimeMonths: Math.max(1, monthsBetween(s.startDate, s.cancelledAt!)),
        mrr: mrrOf(s),
        reason: s.reason,
        comment: s.comment,
      })),
  };
}
