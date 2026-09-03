import { describe, expect, it } from "vitest";
import { addMonthsClamped, endOfDay, parseDateParam } from "../src/utils/dates";
import { nextDueDate } from "../src/modules/subscriptions/subscriptions.service";

describe("addMonthsClamped", () => {
  it("does not overflow short months", () => {
    expect(addMonthsClamped(new Date(2026, 0, 31), 1).getDate()).toBe(28); // Feb 2026
    expect(addMonthsClamped(new Date(2026, 0, 31), 1).getMonth()).toBe(1);
  });

  it("restores the anchor day when the month is long enough", () => {
    const feb = addMonthsClamped(new Date(2026, 0, 31), 1, 31);
    const mar = addMonthsClamped(feb, 1, 31);
    expect([mar.getMonth(), mar.getDate()]).toEqual([2, 31]);
  });

  it("keeps the time of day", () => {
    const d = addMonthsClamped(new Date(2026, 4, 15, 12, 0, 0), 12);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2027, 4, 15, 12]);
  });
});

describe("nextDueDate", () => {
  it("walks a subscription started on the 31st without drifting", () => {
    const start = new Date(2026, 0, 31);
    let due = start;
    const days: number[] = [];
    for (let i = 0; i < 4; i++) {
      due = nextDueDate(due, 1, start);
      days.push(due.getDate());
    }
    expect(days).toEqual([28, 31, 30, 31]); // Feb, Mar, Apr, May
  });
});

describe("date params", () => {
  it("endOfDay covers the whole calendar day", () => {
    const d = endOfDay(new Date(2026, 8, 3));
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([23, 59, 59]);
  });

  it("parseDateParam distinguishes missing, invalid and valid", () => {
    expect(parseDateParam(undefined)).toBeUndefined();
    expect(parseDateParam("")).toBeUndefined();
    expect(parseDateParam("garbage")).toBeNull();
    expect(parseDateParam("2026-09-03")?.getFullYear()).toBe(2026);
  });
});
