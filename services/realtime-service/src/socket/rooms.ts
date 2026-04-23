export function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function dealRoom(dealId: string): string {
  return `deal:${dealId}`;
}
