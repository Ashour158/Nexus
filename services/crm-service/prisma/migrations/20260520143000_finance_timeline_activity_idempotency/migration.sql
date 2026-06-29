-- Enforce durable idempotency for new finance-originated CRM timeline
-- projections. The Activity table remains the timeline owner.
--
-- The index is intentionally scoped to rows written by the hardened projector
-- (`projectionIdempotencyVersion = 1`) so migration remains additive even if
-- historical finance timeline rows contain duplicate sourceEventId values.
-- Existing rows are still protected by the application-level lookup; a future
-- backfill can mark deduplicated historical rows with this idempotency version.

CREATE UNIQUE INDEX IF NOT EXISTS "Activity_finance_source_event_unique"
ON "Activity" (
  "tenantId",
  (("customFields" ->> 'sourceEventId'))
)
WHERE
  "customFields" ->> 'timelineSource' = 'finance'
  AND "customFields" ->> 'projectionIdempotencyVersion' = '1'
  AND "customFields" ? 'sourceEventId'
  AND "customFields" ->> 'sourceEventId' <> '';
