CREATE TABLE "CpqTransitionLedger" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "correlationId" TEXT,
  "actorId" TEXT,
  "source" TEXT,
  "sourceEventId" TEXT,
  "approvalRequestId" TEXT,
  "previousStatus" TEXT,
  "nextStatus" TEXT,
  "result" JSONB,
  "error" JSONB,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CpqTransitionLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cpq_transition_ledger_idempotency_key"
  ON "CpqTransitionLedger"("tenantId", "entity", "entityId", "action", "idempotencyKey");
CREATE UNIQUE INDEX "cpq_transition_ledger_id_tenant_key"
  ON "CpqTransitionLedger"("id", "tenantId");
CREATE INDEX "cpq_transition_ledger_entity_idx"
  ON "CpqTransitionLedger"("tenantId", "entity", "entityId");
CREATE INDEX "cpq_transition_ledger_correlation_idx"
  ON "CpqTransitionLedger"("tenantId", "correlationId");
CREATE INDEX "cpq_transition_ledger_source_event_idx"
  ON "CpqTransitionLedger"("tenantId", "sourceEventId");
