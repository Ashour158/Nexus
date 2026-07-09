/**
 * In-memory presence registry.
 *
 * Tracks which users are currently connected per tenant. This is a stateless
 * push layer, so presence is kept in-process (no schema / Prisma). On a
 * multi-node deployment each node tracks the sockets it terminates; the
 * per-node view is still useful and the join/leave broadcasts flow through the
 * Socket.IO Redis adapter so every node's clients receive them.
 *
 * A single user may hold several sockets (multiple tabs/devices). We reference
 * count per (tenant, user) so a user is only reported "offline" when their last
 * socket disconnects.
 */

interface UserPresence {
  /** Number of live sockets this user currently holds on this node. */
  connections: number;
  /** First time this user became present (ms epoch). */
  since: number;
}

export interface PresenceEntry {
  userId: string;
  connections: number;
  since: number;
}

// tenantId -> (userId -> presence)
const tenants = new Map<string, Map<string, UserPresence>>();

/**
 * Record a socket connecting for a user.
 * @returns `true` if this is the user's first live socket for the tenant
 *          (i.e. they just came online), `false` for additional sockets.
 */
export function addPresence(tenantId: string, userId: string): boolean {
  if (!tenantId || !userId) return false;
  let users = tenants.get(tenantId);
  if (!users) {
    users = new Map<string, UserPresence>();
    tenants.set(tenantId, users);
  }
  const existing = users.get(userId);
  if (existing) {
    existing.connections += 1;
    return false;
  }
  users.set(userId, { connections: 1, since: Date.now() });
  return true;
}

/**
 * Record a socket disconnecting for a user.
 * @returns `true` if this was the user's last live socket for the tenant
 *          (i.e. they just went offline), `false` otherwise.
 */
export function removePresence(tenantId: string, userId: string): boolean {
  if (!tenantId || !userId) return false;
  const users = tenants.get(tenantId);
  if (!users) return false;
  const existing = users.get(userId);
  if (!existing) return false;
  existing.connections -= 1;
  if (existing.connections <= 0) {
    users.delete(userId);
    if (users.size === 0) tenants.delete(tenantId);
    return true;
  }
  return false;
}

/** List the users currently present for a tenant (on this node). */
export function listPresence(tenantId: string): PresenceEntry[] {
  const users = tenants.get(tenantId);
  if (!users) return [];
  const out: PresenceEntry[] = [];
  for (const [userId, p] of users) {
    out.push({ userId, connections: p.connections, since: p.since });
  }
  return out;
}

/** Number of distinct users present for a tenant (on this node). */
export function countPresence(tenantId: string): number {
  return tenants.get(tenantId)?.size ?? 0;
}

/** Whether a specific user is present for a tenant (on this node). */
export function isPresent(tenantId: string, userId: string): boolean {
  return (tenants.get(tenantId)?.get(userId)?.connections ?? 0) > 0;
}
