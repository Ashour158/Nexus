/**
 * Resolve a manager's reporting subtree (self + all descendants) from the org
 * chart owned by auth-service, so the forecast endpoint can roll a manager's
 * number up over their subordinates.
 *
 * Fully fail-open: if the org chart is unavailable or the manager is not found,
 * we return just `[ownerId]` (the manager alone), so the caller degrades to a
 * self-only forecast rather than erroring.
 */

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3000';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const FETCH_TIMEOUT_MS = 5_000;

interface OrgNode {
  userId: string;
  directReports?: OrgNode[];
}

async function fetchOrgChart(
  tenantId: string,
  bearer?: string
): Promise<OrgNode[]> {
  const headers: Record<string, string> = {
    'x-tenant-id': tenantId,
    Accept: 'application/json',
  };
  if (bearer) headers.Authorization = bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`;
  if (INTERNAL_SERVICE_TOKEN) headers['x-service-token'] = INTERNAL_SERVICE_TOKEN;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/api/v1/org-chart`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: OrgNode[] } | null;
    return Array.isArray(body?.data) ? (body!.data as OrgNode[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Find the node for `ownerId` anywhere in the forest. */
function findNode(roots: OrgNode[], ownerId: string): OrgNode | null {
  for (const node of roots) {
    if (!node || !node.userId) continue;
    if (node.userId === ownerId) return node;
    const found = findNode(node.directReports ?? [], ownerId);
    if (found) return found;
  }
  return null;
}

/** Collect this node + every descendant userId (de-duplicated, cycle-safe). */
function collectSubtree(node: OrgNode, acc: Set<string>): void {
  if (!node || !node.userId || acc.has(node.userId)) return;
  acc.add(node.userId);
  for (const child of node.directReports ?? []) collectSubtree(child, acc);
}

/**
 * Returns the manager's subtree owner ids (self + all descendants). Always
 * includes `ownerId`; returns `[ownerId]` when the org chart is unavailable or
 * the manager has no reports.
 */
export async function resolveSubtreeOwnerIds(
  tenantId: string,
  ownerId: string,
  bearer?: string
): Promise<string[]> {
  const roots = await fetchOrgChart(tenantId, bearer);
  const node = findNode(roots, ownerId);
  const acc = new Set<string>([ownerId]);
  if (node) collectSubtree(node, acc);
  return [...acc];
}
