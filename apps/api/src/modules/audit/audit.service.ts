import { prisma } from "../../prisma";

export type AuditAction = "create" | "update" | "delete" | "bill" | "login" | "seed" | "clear";

/**
 * Appends one row to the organization's change journal. Fire-and-forget by
 * design: a journal failure must never fail the business operation it
 * describes, so callers don't await it and errors are only logged.
 */
export function audit(input: {
  organizationId: string;
  userId: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
}): void {
  prisma.auditLog
    .create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary,
        details: input.details === undefined ? undefined : (input.details as object),
      },
    })
    .catch((err: unknown) => console.error("audit log write failed", err));
}

export async function listAuditLog(
  organizationId: string,
  options: { page: number; pageSize: number; entity?: string; userId?: string }
) {
  const where = {
    organizationId,
    ...(options.entity ? { entity: options.entity } : {}),
    ...(options.userId ? { userId: options.userId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page: options.page, pageSize: options.pageSize };
}
