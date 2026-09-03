import { describe, expect, it } from "vitest";
import { buildProjectTimeline, countCalendarDays, countWorkingDays } from "../src/modules/projects/projects.service";

describe("project timeline", () => {
  it("counts both ends of the span", () => {
    expect(countCalendarDays(new Date(2026, 8, 1), new Date(2026, 8, 1))).toBe(1);
    expect(countCalendarDays(new Date(2026, 8, 1), new Date(2026, 8, 7))).toBe(7);
  });

  it("skips weekends in working days", () => {
    // Mon 31 Aug 2026 → Sun 6 Sep 2026: 5 working days
    expect(countWorkingDays(new Date(2026, 7, 31), new Date(2026, 8, 6))).toBe(5);
  });

  it("prefers the planned start and measures a running project to today", () => {
    const t = buildProjectTimeline({
      startDate: new Date(2026, 1, 10),
      endDate: null,
      isFinished: false,
      firstActivityAt: new Date(2026, 0, 1),
      lastActivityAt: null,
    });
    expect(t.startSource).toBe("planned");
    expect(t.finishedAt).toBeNull();
    expect(t.calendarDays).toBeGreaterThan(0);
  });

  it("falls back to the first activity and uses the end date when finished", () => {
    const t = buildProjectTimeline({
      startDate: null,
      endDate: new Date(2026, 4, 22),
      isFinished: true,
      firstActivityAt: new Date(2026, 1, 10),
      lastActivityAt: new Date(2026, 5, 1),
    });
    expect(t.startSource).toBe("activity");
    expect(t.calendarDays).toBe(102);
    expect(t.workingDays).toBe(74);
  });
});
