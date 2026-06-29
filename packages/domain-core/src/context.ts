export type ActorContext = {
  userId: string;
  tenantId: string;
  email?: string;
  roles: string[];
  permissions: string[];
};

export type AuditContext = {
  actor: ActorContext;
  requestId?: string;
  correlationId?: string;
  source: 'api' | 'worker' | 'system' | 'import' | 'automation';
};

export type EngineContext = {
  audit: AuditContext;
  now: Date;
  idempotencyKey?: string;
};
