import { prisma } from "../../prisma";

/**
 * Returns the given project id plus every descendant project id (recursively).
 * Used to roll up money/hours from subprojects into their parent project.
 */
export async function getProjectAndDescendantIds(
  organizationId: string,
  projectId: string
): Promise<string[]> {
  const ids = [projectId];
  let frontier = [projectId];

  while (frontier.length > 0) {
    const children = await prisma.project.findMany({
      where: { organizationId, parentId: { in: frontier } },
      select: { id: true },
    });
    if (children.length === 0) break;
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }

  return ids;
}

/** Depth in the current schema is capped at: client -> project -> subproject. */
export const MAX_PROJECT_DEPTH = 2;

/** Whole days between two dates, counting both ends (1 Sep → 1 Sep is 1 day). */
export function countCalendarDays(from: Date, to: Date): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.round((end - start) / 86_400_000) + 1);
}

/**
 * Same span counted in working days (Sat/Sun skipped, no holiday calendar) —
 * the unit the business already estimates work in, so "20 рабочих дней" on a
 * WORK product can be compared with what the project actually took.
 */
export function countWorkingDays(from: Date, to: Date): number {
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let days = 0;
  while (cursor <= end) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) days++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * The project's real timeline, as opposed to whatever was planned.
 *
 * The start is the project's own startDate when someone filled it in, and
 * otherwise the earliest thing that actually happened on it — a booked
 * operation, a logged hour, a client request. The end is the date the project
 * was marked finished; while it's still running the period is measured to
 * today so the number keeps meaning "how long this has been going".
 *
 * Dates come from the project and all its subprojects, since a parent's real
 * span has to cover the work done inside it.
 */
export function buildProjectTimeline(input: {
  startDate: Date | null;
  endDate: Date | null;
  isFinished: boolean;
  firstActivityAt: Date | null;
  lastActivityAt: Date | null;
}) {
  const { startDate, endDate, isFinished, firstActivityAt, lastActivityAt } = input;

  const startedAt = startDate ?? firstActivityAt;
  const startSource: "planned" | "activity" | null = startDate
    ? "planned"
    : firstActivityAt
      ? "activity"
      : null;

  // A project closed without an explicit end date falls back to the last thing
  // that happened on it — better than showing nothing for a finished project.
  const finishedAt = isFinished ? (endDate ?? lastActivityAt) : null;
  const measuredTo = finishedAt ?? new Date();

  return {
    startedAt,
    startSource,
    finishedAt,
    isFinished,
    firstActivityAt,
    lastActivityAt,
    calendarDays: startedAt ? countCalendarDays(startedAt, measuredTo) : null,
    workingDays: startedAt ? countWorkingDays(startedAt, measuredTo) : null,
  };
}
