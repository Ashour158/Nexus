export type DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  eventId: string;
  type: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  actorId?: string;
  correlationId?: string;
  payload: TPayload;
};

export type DomainEventPublisher = {
  publish<TPayload extends Record<string, unknown>>(event: DomainEvent<TPayload>): Promise<void>;
};
