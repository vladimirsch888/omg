import { describe, expect, it } from "vitest";
import { computeRetention, type RetentionSubscription } from "../src/modules/retention/retention.service";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);

function sub(over: Partial<RetentionSubscription> & { id: string; startDate: Date }): RetentionSubscription {
  return {
    clientId: over.id,
    clientName: `Клиент ${over.id}`,
    productName: "amoCRM",
    price: 12_000,
    durationMonths: 1,
    status: "ACTIVE",
    cancelledAt: null,
    reason: null,
    comment: null,
    billings: [over.startDate],
    ...over,
  };
}

const now = d(2026, 9, 7);

describe("computeRetention", () => {
  const subs: RetentionSubscription[] = [
    // Started in March, billed every month on the 5th — on time.
    sub({ id: "a", startDate: d(2026, 3, 5), billings: [d(2026, 3, 5), d(2026, 4, 5), d(2026, 5, 5), d(2026, 6, 5), d(2026, 7, 5), d(2026, 8, 5)] }),
    // Started in March, cancelled in June because of price.
    sub({ id: "b", startDate: d(2026, 3, 20), status: "CANCELLED", cancelledAt: d(2026, 6, 12), reason: "Дорого", billings: [d(2026, 3, 20), d(2026, 4, 20), d(2026, 5, 20)] }),
    // Started in July, renewed 10 days late in August.
    sub({ id: "c", startDate: d(2026, 7, 1), billings: [d(2026, 7, 1), d(2026, 8, 11)] }),
  ];
  const report = computeRetention(subs, 12, now);

  it("builds one cohort per starting month with retention shares", () => {
    const march = report.cohorts.find((c) => c.cohort === "2026-03")!;
    expect(march.size).toBe(2);
    expect(march.bySubscriptions.slice(0, 5)).toEqual([1, 1, 1, 1, 0.5]); // months 0..4 = Mar..Jul; b dies in June → from July only a
    expect(march.bySubscriptions[3]).toBe(1); // June: cancelled during June still counts as alive that month
    expect(march.bySubscriptions[7]).toBeNull(); // October has not happened yet
    expect(report.cohorts.some((c) => c.cohort === "2026-04")).toBe(false); // nothing started in April
  });

  it("counts churn against everything alive in the year", () => {
    expect(report.summary.activeNow).toBe(2);
    expect(report.summary.cancelledLast12m).toBe(1);
    expect(report.summary.churnRate12m).toBeCloseTo(1 / 3);
    expect(report.summary.averageLifetimeMonths).toBe(3);
    expect(report.reasons).toEqual([{ reason: "Дорого", count: 1, mrrLost: 12_000 }]);
  });

  it("separates on-time from late renewals", () => {
    const august = report.monthly.find((m) => m.month === "2026-08")!;
    expect(august.renewalsDue).toBe(2);
    expect(august.renewedOnTime).toBe(1);
    expect(august.renewedLate).toBe(1);
    expect(august.averageDelayDays).toBe(5); // (0 + 10) / 2
    const june = report.monthly.find((m) => m.month === "2026-06")!;
    expect(june.cancelled).toBe(1);
    expect(june.churnRate).toBeCloseTo(0.5);
    expect(june.mrrLost).toBe(12_000);
  });

  it("lists the churned subscriptions with their lifetime", () => {
    expect(report.churned).toHaveLength(1);
    expect(report.churned[0]).toMatchObject({ clientName: "Клиент b", lifetimeMonths: 3, reason: "Дорого" });
  });

  it("copes with no subscriptions at all", () => {
    const empty = computeRetention([], 6, now);
    expect(empty.cohorts).toEqual([]);
    expect(empty.monthly).toHaveLength(6);
    expect(empty.summary.churnRate12m).toBeNull();
  });
});
