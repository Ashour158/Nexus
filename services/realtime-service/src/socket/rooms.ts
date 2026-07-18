export function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function dealRoom(dealId: string): string {
  return `deal:${dealId}`;
}

export function contactRoom(contactId: string): string {
  return `contact:${contactId}`;
}

export function accountRoom(accountId: string): string {
  return `account:${accountId}`;
}

/**
 * Tenant-scoped module list room. A client that `subscribe`s to a whole module
 * (e.g. a deals list page) joins this room and receives every event for that
 * module within its own tenant — and no other tenant's, because the tenantId is
 * taken from the socket's verified JWT, never from client input.
 */
export function moduleRoom(tenantId: string, module: string): string {
  return `tenant:${tenantId}:module:${module}`;
}

/**
 * Tenant-scoped module record room. A client that `subscribe`s to a specific
 * record (e.g. `deal:<id>`) joins this room. Kept distinct from the legacy
 * global record rooms (`deal:<id>`) so the generic subscription path can never
 * leak across tenants.
 */
export function moduleRecordRoom(tenantId: string, module: string, recordId: string): string {
  return `tenant:${tenantId}:module:${module}:${recordId}`;
}
