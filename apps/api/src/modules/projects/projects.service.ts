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
