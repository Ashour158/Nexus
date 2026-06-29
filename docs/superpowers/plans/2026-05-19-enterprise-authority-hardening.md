# Enterprise CRM Platform Consolidation & Authority Hardening

## Objective

Consolidate the platform around strict service ownership, shared workflow authority, approval authority, policy authority, audit/event authority, and thin frontend/BFF orchestration. This phase is not feature expansion; it is an authority hardening phase to reduce duplicated business logic and prepare the CRM foundation for enterprise-scale extension.

## Confirmed Architecture Direction

The platform is a hybrid enterprise CRM architecture:

- Next.js web application in `apps/web`
- Fastify service estate under `services/*`
- Prisma/PostgreSQL persistence in service-local schemas
- Kafka/outbox/event infrastructure in shared packages and services
- Redis, Meilisearch, reporting, approval, workflow, metadata, integration, CRM, and finance/revenue services
- Deprecated quote service still present and isolated by documentation, but not fully removed

## Target Ownership Matrix

| Business area | Authoritative owner | Allowed callers | Notes |
| --- | --- | --- | --- |
| Accounts, contacts, leads, deals, activities, tasks, pipeline | `services/crm-service` | Web/BFF, workflow-service, integration-service | CRM service owns customer and sales lifecycle state. |
| RFQ, quotes, CPQ, DRQ, pricing, revisions, orders | Finance/revenue service | Web/BFF, workflow-service, approval-service | Quote and RFQ mutation must not happen in web routes. |
| Approval requests, approver maps, chains, delegation, escalation | `services/approval-service` | Finance, CRM, workflow-service | Modules must request approvals, not calculate final authority locally. |
| Transitions, workflow runtime, SLA, automations | Workflow service / shared engine | CRM, finance, approval-service | All status transitions pass through the shared transition contract. |
| Validation rules, custom fields, coding policies | `services/metadata-service` | CRM, finance, web admin UI | Admin-configurable validation is policy data, not UI-only logic. |
| Template rendering, document package output | Document service | Finance/revenue service | Seller quote UI must not expose render internals. |
| External sync, webhooks, integrations | `services/integration-service` | Services via events/outbox | No direct side effects from frontend. |

## Duplicate Logic Matrix

| Area | Current risk | Hardening action |
| --- | --- | --- |
| Quote creation | Web preview route, finance service, deprecated quotes-service paths | Block direct preview quote creation without RFQ context; route production through finance/revenue authority. |
| RFQ conversion | Web preview route can convert directly | Require reviewed/responded RFQ state before conversion and later move conversion fully into finance workflow endpoint. |
| Quote/DRQ status | Status values can be assigned directly in preview routes | Add guard now; migrate to workflow transition command contract. |
| Seller/admin CPQ UI | Quote page exposes template/package governance | Move admin controls to CPQ admin console and keep seller UI workflow-focused. |
| Events/audit | Preview emits timeline events locally; services may emit inconsistently | Standardize outbox event contract and actor/tenant metadata. |

## Implementation Sequence

1. Add shared CPQ authority guards for web preview/BFF paths.
2. Harden RFQ creation payloads: require `dealId`, `accountId`, and normalized line items.
3. Harden quote creation payloads: require RFQ context, commercial anchors, line items, and approval path metadata.
4. Harden RFQ conversion: allow conversion only from reviewed/responded states.
5. Convert remaining web/BFF quote actions into thin calls to finance/revenue endpoints.
6. Add workflow transition command contract for quote/RFQ/DRQ/order transitions.
7. Move seller/admin CPQ UI separation behind role-aware route boundaries.
8. Add service-level tests for invalid transitions, revision freshness, approval checks, and audit/outbox emission.

## Transition Engine Design

All state changes should converge on a command shape like:

```ts
workflowEngine.transition({
  tenantId,
  actorId,
  entity: 'quote',
  entityId,
  action: 'SUBMIT_FOR_APPROVAL',
  idempotencyKey,
  payload,
});
```

The engine must validate:

- Current state and allowed action.
- Actor permission and tenant scope.
- Approval requirements and pending approval state.
- Revision freshness for quotes and DRQs.
- Template/render package freshness where documents are required.
- SLA and policy constraints from metadata/workflow configuration.

Successful transitions must emit:

- Audit record with tenant, actor, entity, previous state, next state, action, correlation ID.
- Outbox event using a stable domain-event name.
- Notification intent where configured.
- Timeline event for CRM-facing history.
- Integration/webhook event where configured.

## Workflow Hardening Implementation Track

| Track | First implementation | Later migration |
| --- | --- | --- |
| RFQ create | Web preview guards require deal, account, normalized lines | Finance service owns RFQ create policy and calls metadata validation rules. |
| RFQ convert | Web preview guard requires reviewed/responded state | Workflow transition command performs conversion and event/audit writes. |
| Quote create | Web preview guard requires RFQ and approval context | Finance service creates immutable quote revision from RFQ snapshot only. |
| DRQ | Existing request validation remains, then route through approval-service | Approval completion creates a new quote revision, never mutates approved quote. |
| Order | Keep generation behind accepted/signed quote state | Finance service rejects superseded/expired revisions with FK-backed snapshot. |

## Frontend/BFF Cleanup Track

- Web route handlers must become auth-aware proxy/orchestration endpoints.
- Seller UI must expose RFQ, quote workflow status, approval map, send/download/sign actions.
- Admin UI must own quote templates, render package governance, workflow configuration, approval policies, and CPQ package selection.
- Preview-only state mutation must stay development-only and guarded by the same authority contract used for tests.

## Audit/Event Standardization

Minimum event envelope:

```ts
{
  eventId,
  eventType,
  tenantId,
  actorId,
  aggregateType,
  aggregateId,
  occurredAt,
  correlationId,
  idempotencyKey,
  version,
  payload,
}
```

Domain events should use names such as:

- `rfq.created`
- `rfq.reviewed`
- `rfq.converted_to_quote`
- `quote.revision_created`
- `quote.submitted_for_approval`
- `quote.approved`
- `quote.sent`
- `quote.signed`
- `drq.requested`
- `drq.approved`
- `order.created_from_quote`

## Migration Strategy

1. Freeze new business logic in BFF/web routes except preview guards.
2. Add service-level transition endpoints in finance/revenue service.
3. Move quote/RFQ/DRQ mutations from web routes into finance service calls.
4. Keep deprecated quotes-service read-compatible while marking mutation endpoints unavailable.
5. Backfill normalized RFQ/quote line tables from JSON structures.
6. Backfill quote revision snapshots and document package snapshots.
7. Add constraints and indexes after data is normalized.
8. Remove deprecated quote mutation paths after parity tests and API consumers are migrated.

## Required Refactors

- Replace direct status mutation with workflow transition calls in quote, RFQ, DRQ, order, lead, and deal flows.
- Replace JSON-authoritative RFQ/quote lines with normalized lines plus immutable snapshots.
- Replace seller-facing template/render controls with admin-governed configuration.
- Route mass updates and bulk actions through service use cases, not direct persistence updates.
- Make audit/outbox emission mandatory inside service use cases.
- Add idempotency keys to write commands across CRM and finance modules.

## Blockers To Resolve

- Exact production finance/revenue transition endpoint contract needs to be finalized.
- Deprecated quotes-service consumers must be identified before mutation routes can be disabled.
- Data migration scripts are needed before enforcing database-level NOT NULL/FK/unique constraints on RFQ and quote lines.
- Existing preview screens may need UX adjustment to move from direct quote creation to RFQ-first creation.

## First Hardening Slice

The first code slice addresses current web preview/BFF authority leakage without removing working flows:

- Add tests for CPQ authority guard behavior.
- Add `apps/web/src/lib/server/cpq-authority.ts`.
- Apply the guard to:
  - `apps/web/src/app/api/finance/rfqs/route.ts`
  - `apps/web/src/app/api/finance/rfqs/[id]/convert/route.ts`
  - `apps/web/src/app/api/quotes/route.ts`

## Risks

- Some preview UI flows may currently rely on permissive draft creation. Those flows should be adjusted to create RFQs first and submit them to review before conversion.
- Production routes should remain proxy-only for this slice, with deeper enforcement moved into the authoritative finance/revenue service.

## Verification

- Run targeted Vitest tests for CPQ authority guards.
- Run `pnpm --filter @nexus/web typecheck`.
- Run `pnpm --filter @nexus/web build` if route/type changes are accepted.

## Remaining CPQ Mutation Path Closure

### Paths Inspected

- `services/finance-service/src/consumers/auto-quote.consumer.ts`
- `services/finance-service/src/graphql/resolvers.ts`
- `services/finance-service/src/graphql/schema.graphql`
- `services/quotes-service/src/routes/quotes.routes.ts`
- `services/deals-service/src/graphql/resolvers.ts`
- `services/deals-service/src/services/quotes.service.ts`
- `apps/web/src/app/api/quotes/route.ts`
- `apps/web/src/app/api/finance/discount-requests/route.ts`
- `apps/web/src/app/api/finance/rfqs/[id]/convert/route.ts`
- `apps/web/src/app/api/quotes/[id]/convert-order/route.ts`
- `services/graphql-gateway/schemas/finance.graphql`
- `services/graphql-gateway/schemas/deals.graphql`

### Paths Refactored

- `auto-quote.consumer.ts` no longer creates quote rows, line items, pricing snapshots, or quote numbers directly. It now validates the source event, requires RFQ/account/deal anchors, skips already converted RFQs idempotently, and calls the finance commercial authority through RFQ conversion.
- Finance GraphQL quote mutations are now disabled at resolver level. Quote GraphQL remains read-compatible.
- Deals GraphQL quote mutations are now disabled at resolver level because deals-service is not the CPQ authority. Quote GraphQL reads remain read-compatible.
- Deals-service `syncQuoteFromEvent` is disabled so it cannot mutate quote projections without a dedicated read-model projector contract.

### Paths Disabled

- Deprecated `quotes-service` write endpoints now return `410 Gone` with `QUOTE_MUTATION_MOVED` and the message `Quote mutations have moved to finance-service authority.`
- Disabled endpoints:
  - `POST /api/v1/quotes`
  - `PATCH /api/v1/quotes/:id`
  - `DELETE /api/v1/quotes/:id`

### Remaining Risks

- Deals-service quote projection sync is now disabled; the next slice should replace it with a dedicated idempotent read-model projector if cross-service quote read models are still needed.
- GraphQL gateway schemas still advertise quote mutation fields for finance and deals. Runtime resolvers now reject writes, but schema cleanup should follow once consumers migrate.
- Web dev-preview routes still mutate in-memory preview state behind `DEV_PREVIEW_ENABLED`. Production paths proxy to finance-service. The next hardening slice should ensure preview mode is impossible in staging/production by environment assertion.
- `finance-service` internal use cases still contain direct Prisma writes by design because they are now the authoritative boundary. The next slice should move more of these internal status changes behind the shared transition command for consistency.

### Next Recommended Slice

Close the schema/contract layer:

- Remove or deprecate quote mutation fields from `services/graphql-gateway/schemas/finance.graphql` and `services/graphql-gateway/schemas/deals.graphql`.
- Formalize finance-service transition endpoint(s) around `transitionCpqEntity`.
- Classify deals-service quote projection behavior and make it read-model-only with event-source metadata and idempotency.
- Add an environment boot guard that prevents `DEV_PREVIEW_ENABLED` from running outside local development.

## Schema and Transition Contract Hardening

### GraphQL Fields Removed Or Deprecated

- `services/graphql-gateway/schemas/deals.graphql` no longer advertises `createQuote`, `updateQuote`, or `deleteQuote` because deals-service is not a CPQ mutation authority.
- `services/graphql-gateway/schemas/finance.graphql` keeps quote mutation fields only as compatibility stubs and marks them deprecated with: `CPQ mutations moved to finance-service transition authority.`
- Quote read queries remain in both schemas for compatibility while consumers move to finance-service read APIs.

### Finance Transition Endpoint

- Added `POST /api/v1/cpq/transitions` in finance-service.
- The endpoint requires `entity`, `entityId`, `action`, and `idempotencyKey`.
- Tenant and actor are taken from authenticated request context, not request payload.
- Correlation ID is accepted from `x-correlation-id`, then `x-request-id`, then Fastify request ID.
- The endpoint calls `transitionCpqEntity(...)` before executing supported authoritative use cases.
- Supported transitions in this slice:
  - `rfq.CONVERT_TO_QUOTE`
  - `quote.CONVERT_TO_ORDER`

### DEV_PREVIEW Startup Guard

- Added shared web guard for dev-preview resolution.
- `DEV_PREVIEW_ENABLED` now fails fast outside local development, including production and staging deployment environments.
- The boot error is: `DEV_PREVIEW_ENABLED is not allowed outside local development.`

### Direct Status Assignments Moved Or Documented

- Highest-risk external transition entrypoints now route through the finance transition contract for RFQ conversion and quote-to-order conversion.
- Internal finance-service persistence still updates final statuses after transition validation because finance-service remains the authority. These internal writes are documented for later conversion to a deeper transition-state persistence adapter.
- Remaining direct status paths to harden in later slices include quote submit/send/accept/reject/void, DRQ approval/rejection consumer updates, RFQ send/review lifecycle, and order fulfillment state changes.

### Quote Projection Decision

- Chosen option: Option A, no deals-service quote projection writes for now.
- Rationale: safer than introducing a partial read-model projector before event metadata and replay contracts are fully standardized.
- Deals-service quote write/projection sync remains disabled and read compatibility stays intact.

### Tests Run

- `pnpm --filter @nexus/graphql-gateway test -- schema-authority.test.ts`
- `pnpm --filter @nexus/web test -- dev-preview-guard.test.ts`
- `pnpm --filter @nexus/finance-service test -- cpq-transitions.routes.test.ts`

### Remaining Risks

- Finance GraphQL service-level schema/resolver compatibility should be reviewed after gateway schema cleanup, especially if any internal Apollo composition reads mutation metadata.
- `POST /api/v1/cpq/transitions` currently covers the highest-risk RFQ and quote-to-order transitions only. DRQ and quote approval transitions should be added when approval-service transition contracts are normalized.
- Quote read-model projection is intentionally disabled in deals-service. If dashboards require local quote projections, add a dedicated `QuoteProjection` model with source event metadata and idempotent projector tests.

### Next Recommended Slice

Normalize approval-driven CPQ transitions:

- Add transition actions for quote submit/approve/reject/send/sign and DRQ approve/reject.
- Route approval-service callbacks through finance-service transition commands.
- Replace internal status writes with a transition persistence adapter that records previous status, next status, actor, policy, and event metadata in one place.

## Approval-Driven CPQ Transition Normalization

### Actions Added

- Quote transition validation now covers:
  - `SUBMIT_FOR_APPROVAL`
  - `APPROVE`
  - `REJECT`
  - `SEND_TO_CUSTOMER`
  - `REQUEST_SIGNATURE`
  - `MARK_SIGNED`
  - `CONVERT_TO_ORDER`
- DRQ transition validation now covers:
  - `SUBMIT_FOR_APPROVAL`
  - `APPROVE`
  - `REJECT`
  - `APPLY_TO_QUOTE_REVISION`

### Approval Callback Behavior Before/After

- Before: `approval.consumer.ts` directly updated quote status, DRQ status, and quote revisions inside the consumer.
- After: approval callbacks construct a system `EngineContext` and call finance-service commercial transition methods:
  - approved quote callbacks call `approveQuoteFromApproval(...)`
  - rejected quote callbacks call `rejectQuoteFromApproval(...)`
  - approved DRQ callbacks call `approveDiscountRequestFromApproval(...)`
  - rejected DRQ callbacks call `rejectDiscountRequestFromApproval(...)`

### Direct Status Writes Removed

- Approval consumer no longer assigns `quote.status`, `quote.approvalStatus`, or `discountRequest.status` directly.
- Quote send, signature request, and signature completion now validate through `transitionCpqEntity(...)` before persistence writes.
- Finance-service still performs the authoritative persistence write after validation. That write remains inside finance-service, not in BFF, GraphQL, approval-service, or deprecated services.

### DRQ Revision Behavior

- Approved DRQ now validates the original `quoteRevisionId` from DRQ custom fields.
- If the quote revision is stale, superseded, or missing, DRQ application is rejected.
- Successful DRQ approval:
  - marks the DRQ approved
  - updates the quote with the approved discount
  - creates a new immutable quote revision
  - invalidates rendered package metadata
  - emits `drq.approved`, `quote.revision_created`, and `quote.revised_from_drq`

### Transition Endpoint Updates

- `POST /api/v1/cpq/transitions` now accepts:
  - `quote.SUBMIT_FOR_APPROVAL`
  - `quote.SEND_TO_CUSTOMER`
  - `quote.REQUEST_SIGNATURE`
  - `quote.MARK_SIGNED`
  - `drq.SUBMIT_FOR_APPROVAL`
- Approval-only actions remain internal to finance-service transition methods for now.

### Tests Added Or Updated

- `approval.consumer.test.ts`
  - approved DRQ callback routes through finance authority and creates a revision
  - rejected quote callback routes through finance authority
- `commercial-records.use-case.test.ts`
  - quote approval via transition authority
  - quote send blocked before approval
  - approved DRQ creates a new quote revision
- `cpq-transitions.routes.test.ts`
  - approved quote send through transition endpoint
  - DRQ submit through transition endpoint

### Remaining Direct Status Writes

- Internal finance-service methods still write the final status after transition validation.
- The next consolidation step should introduce a small transition persistence adapter to store previous status, next status, actor, idempotency key, correlation ID, and emitted event metadata consistently.
- Quote service methods still contain legacy lifecycle helpers (`sendQuote`, `acceptQuote`, `rejectQuote`, `voidQuote`) and should be made transition-adapter backed or marked internal-only.

### Next Recommended Slice

Create the transition persistence adapter and wire all finance-service CPQ status writes through it, then add idempotency storage so duplicate approval events cannot reapply quote revisions.

## CPQ Transition Persistence and Idempotency Ledger

### Ledger Model Added

- Added dedicated `CpqTransitionLedger` to `services/finance-service/prisma/schema.prisma`.
- Added migration `services/finance-service/prisma/migrations/20260520110000_cpq_transition_ledger/migration.sql`.
- The ledger stores tenant, entity, entity ID, action, idempotency key, correlation ID, actor, source, source event ID, approval request ID, previous/next status, result, error, status, and timestamps.

### Unique Key Strategy

- The durable idempotency key is:
  - `tenantId + entity + entityId + action + idempotencyKey`
- Supporting indexes were added for:
  - `tenantId + entity + entityId`
  - `tenantId + correlationId`
  - `tenantId + sourceEventId`

### Adapter Behavior

- Added `persistCpqTransition(...)` inside the finance commercial use case.
- Behavior:
  - creates a `STARTED` ledger row before mutation
  - returns stored `result` for duplicate `SUCCEEDED` transitions
  - rejects duplicate `STARTED` transitions as already in progress
  - rejects duplicate `FAILED` transitions deterministically with the stored error context
  - updates the ledger to `SUCCEEDED` with transition result and next status
  - updates the ledger to `FAILED` with structured error if the transition fails

### Actions Wired Through Ledger

- `rfq.CONVERT_TO_QUOTE`
- `quote.SUBMIT_FOR_APPROVAL`
- `quote.APPROVE`
- `quote.REJECT`
- `quote.SEND_TO_CUSTOMER`
- `quote.REQUEST_SIGNATURE`
- `quote.MARK_SIGNED`
- `quote.CONVERT_TO_ORDER`
- `drq.APPROVE`
- `drq.REJECT`

### DRQ Duplicate Protection

- Approval callbacks pass approval event metadata into the finance transition layer.
- Duplicate approved DRQ callbacks return the stored transition result and do not create another quote revision.
- Stale DRQ quote revision validation remains inside the authoritative transition execution path.

### Quote-To-Order Duplicate Protection

- Quote-to-order conversion now runs through the ledger.
- Duplicate `quote.CONVERT_TO_ORDER` calls with the same idempotency key return the stored order result and do not create a second sales order.

### CPQ Transition Endpoint Behavior

- `POST /api/v1/cpq/transitions` now passes idempotency and correlation metadata into authoritative finance use cases.
- The endpoint no longer performs a separate pre-validation transition that could block idempotent duplicate reads after the entity has already moved state.
- Duplicate successful endpoint calls return the stored authoritative transition result.
- Missing idempotency key remains rejected by schema validation.

### Audit And Outbox Traceability

- Ledger rows store correlation ID, source, source event ID, and approval request ID when supplied.
- Existing `emitCommercialEvent(...)` still writes outbox rows and publishes domain events.
- Remaining gap: outbox/audit records do not yet store the transition ledger ID directly. Correlation is currently via correlation ID, source event ID, aggregate ID, and action/event naming.

### Tests Added Or Updated

- `commercial-records.use-case.test.ts`
  - successful quote approval writes STARTED then SUCCEEDED ledger states
  - duplicate successful DRQ approval returns stored result and does not create a quote revision
  - duplicate STARTED transition is rejected safely
  - failed transition stores FAILED with structured error
  - duplicate quote-to-order returns stored order without opening a transaction
- `cpq-transitions.routes.test.ts`
  - duplicate endpoint idempotency key returns stored transition result
  - failed endpoint transition stores FAILED in ledger

### Verification Run For This Slice

- `pnpm --filter @nexus/finance-service test -- approval.consumer.test.ts cpq-transitions.routes.test.ts commercial-records.use-case.test.ts`

### Remaining Risks

- Legacy quote lifecycle helpers (`acceptQuote`, `rejectQuote`, `voidQuote`) are not yet ledger-backed.
- DRQ `SUBMIT_FOR_APPROVAL` endpoint currently validates transition state but does not create the approval request in this route slice.
- Ledger updates and business mutations are coordinated in the use case; after Prisma client generation, the next improvement is to move the ledger write and mutation into one Prisma transaction for DBs that support the current delegate shape cleanly.
- Outbox records do not yet include `transitionLedgerId`.

### Next Recommended Slice

Close the remaining legacy quote lifecycle helpers and add transition ledger IDs into audit/outbox payloads, then generate and apply the Prisma migration against the running PostgreSQL database.

## CPQ Ledger Traceability and Legacy Lifecycle Closure

### Migration Readiness Result

- Reviewed `services/finance-service/prisma/schema.prisma` and `services/finance-service/prisma/migrations/20260520110000_cpq_transition_ledger/migration.sql`.
- `CpqTransitionLedger` remains additive only: no destructive changes and safe for existing finance data.
- Unique strategy is enforced by `tenantId + entity + entityId + action + idempotencyKey`.
- Short explicit database index names were added to avoid PostgreSQL identifier truncation:
  - `cpq_transition_ledger_idempotency_key`
  - `cpq_transition_ledger_id_tenant_key`
  - `cpq_transition_ledger_entity_idx`
  - `cpq_transition_ledger_correlation_idx`
  - `cpq_transition_ledger_source_event_idx`
- Prisma client generation passed with `pnpm --filter @nexus/finance-service db:generate`.
- `prisma migrate deploy` path was checked:
  - package script is `pnpm --filter @nexus/finance-service db:migrate`
  - it requires `FINANCE_DATABASE_URL`
  - with `FINANCE_DATABASE_URL=postgresql://nexus:nexus@localhost:5433/nexus_finance`, Prisma reached the running database but returned a generic schema-engine error before applying migrations
- The migration SQL itself was validated against the running `nexus-postgres` container inside `BEGIN ... ROLLBACK` using `psql -v ON_ERROR_STOP=1`; it created the table and all indexes cleanly and rolled back.

### transitionLedgerId Propagation

- `persistCpqTransition(...)` now attaches `transitionLedgerId` to successful transition results before storing them in the ledger.
- Duplicate successful transitions return the stored result, including the same `transitionLedgerId` when present.
- `POST /api/v1/cpq/transitions` now includes `transitionLedgerId` in the response for routed transition use cases.
- CPQ outbox payloads now include compatible nested metadata where feasible:
  - `metadata.transitionLedgerId`
  - `metadata.idempotencyKey`
  - `metadata.correlationId`
  - `metadata.approvalRequestId`
  - `metadata.sourceEventId`
  - `metadata.source`
- This avoids breaking existing event consumers because the metadata is additive and nested.

### Legacy Lifecycle Helpers Found

- `acceptQuote(...)`
- `rejectQuote(...)`
- `voidQuote(...)`
- `sendQuote(...)` was already ledger-backed in the previous slice.
- Batch `expireQuotes(...)` remains in the lower-level quote service and is documented as not yet routed through per-quote transition ledger entries.

### Helpers Routed Or Deprecated

- `acceptQuote(...)` now validates through `transitionCpqEntity({ entity: 'quote', action: 'ACCEPT' })` and persists through `persistCpqTransition(...)`.
- `rejectQuote(...)` now validates customer rejection through `transitionCpqEntity({ entity: 'quote', action: 'REJECT', payload: { customerRejection: true } })` and persists through the ledger.
- `voidQuote(...)` now validates through `transitionCpqEntity({ entity: 'quote', action: 'VOID' })` and persists through the ledger.
- Quote route handlers now pass `Idempotency-Key` / `X-Idempotency-Key` and correlation headers into finance authority for send/accept/reject/void.
- No read behavior was removed.

### Transaction Behavior

- Existing quote-to-order business mutation still uses a Prisma transaction for order creation plus quote status update.
- The transition ledger wraps high-risk transitions and records `STARTED`, then `SUCCEEDED` or `FAILED`.
- Full single-transaction coordination across ledger write, service-helper mutation, outbox write, and Kafka publish remains partially constrained by existing service boundaries and helper abstractions.
- Current consistency guarantee: duplicate requests with the same idempotency key are blocked or replayed from the ledger before business mutation runs.

### Recovery Behavior For STARTED Ledgers

- Duplicate `STARTED` transitions return a safe business-rule conflict: `CPQ transition is already in progress`.
- The intended operational behavior is retry-after/backoff from clients or admin review.
- Recommended future reconciliation job:
  - find `STARTED` rows older than an operational threshold, such as 10-15 minutes
  - inspect related aggregate status and outbox events
  - mark as `FAILED` or `SUCCEEDED` with reconstructed result when deterministic
  - expose stuck transitions in admin/audit views

### Tests Added Or Updated

- `commercial-records.use-case.test.ts`
  - accepted quote returns `transitionLedgerId`
  - accepted quote outbox payload includes transition metadata
  - duplicate accept returns stored result and does not call the legacy quote helper again
  - reject helper routes through transition validation and ledger
  - void helper routes through transition validation and ledger
- `cpq-transitions.routes.test.ts`
  - duplicate transition endpoint response includes the same `transitionLedgerId`

### Verification Run For This Slice

- `pnpm --filter @nexus/finance-service test -- approval.consumer.test.ts cpq-transitions.routes.test.ts commercial-records.use-case.test.ts`
- `pnpm --filter @nexus/finance-service typecheck`
- `pnpm --filter @nexus/web typecheck`
- `pnpm --filter @nexus/finance-service db:generate`
- migration SQL dry-run against Docker Postgres with `BEGIN ... ROLLBACK`

### Remaining Risks

- `pnpm --filter @nexus/finance-service db:migrate` still needs environment-specific Prisma schema-engine resolution. The SQL is valid, but Prisma deploy did not complete in this shell.
- Batch quote expiration is not yet per-quote ledger-backed.
- Ledger ID is in outbox payload metadata, not a dedicated outbox column.
- A reconciliation job for stuck `STARTED` transitions is documented but not built.

### Next Recommended Slice

Close batch expiry and reconciliation:

- Replace batch quote expiry with per-quote `quote.EXPIRE` transition commands or a scheduler that writes one ledger row per expired quote.
- Add a stuck-transition reconciliation worker.
- Add `transitionLedgerId` to a dedicated audit/outbox metadata column if the shared outbox contract accepts it.

## Quote Expiry and Transition Recovery Hardening

### Expiry Paths Found

- `services/finance-service/src/services/quotes.service.ts`
  - `sendQuote(...)` previously changed expired quotes to `EXPIRED` directly before throwing.
  - `expireQuotes(...)` previously used `prisma.quote.updateMany(...)` to batch-set `SENT` quotes to `EXPIRED`.
- `services/finance-service/src/use-cases/commercial-records.use-case.ts`
  - `transitionCpqEntity(...)` already had a shallow `quote.EXPIRE` branch that only allowed `SENT` / `VIEWED`.
- `services/finance-service/src/consumers/gdpr.consumer.ts`
  - uses `quote.updateMany(...)` for GDPR erasure/anonymization, not quote lifecycle expiry.
- No scheduled quote expiry job was found beyond the `expireQuotes(...)` service helper.

### Batch Mutation Removed

- `quotes.service.expireQuotes(...)` no longer performs any lifecycle mutation and now throws a business-rule error telling callers to use CPQ transition authority.
- `quotes.service.sendQuote(...)` no longer silently mutates expired quotes to `EXPIRED`; expiry is handled by the authoritative transition path.
- `commercialRecords.expireQuotes(...)` now finds candidate expired quotes and calls `expireQuote(...)` once per quote.
- No quote lifecycle `updateMany` remains in the expiry path.

### quote.EXPIRE Transition Rules

- `quote.EXPIRE` now allows active customer-facing statuses:
  - `APPROVED`
  - `SENT`
  - `VIEWED`
- It blocks final or invalid statuses:
  - `SIGNED`
  - `ACCEPTED`
  - `CONVERTED`
  - `CONVERTED_TO_ORDER`
  - `VOID`
  - `SUPERSEDED`
  - `EXPIRED`
  - `REJECTED`
- It validates current quote revision freshness by checking the latest revision version against the quote version.
- It requires `expiresAt` or `validUntil` to be past unless forced by system/admin authority.
- It updates the quote to `EXPIRED`, creates a `quote.expired` revision snapshot, emits `quote.expired`, and includes `transitionLedgerId` in event metadata.

### Idempotency Strategy

- Single quote expiry defaults to:
  - `quote-expire:{quoteId}:{yyyy-mm-dd}`
- Batch expiry uses the same per-quote key, so rerunning the same daily scheduler safely returns the stored ledger result instead of expiring twice.
- Duplicate successful expiry returns the original stored result with the same `transitionLedgerId`.

### Stuck STARTED Reconciliation

- Added `reconcileStuckCpqTransitions(...)` in the finance commercial use case.
- It finds `CpqTransitionLedger` rows with:
  - `status = STARTED`
  - `createdAt < cutoff`
  - optional tenant scope
  - configurable limit
- It marks stale rows as `FAILED` with:
  - `error.code = TRANSITION_TIMEOUT`
  - `error.message = Transition remained STARTED beyond recovery threshold.`
- It does not retry automatically in this slice because retry semantics need aggregate-specific recovery rules.

### Tests Added Or Updated

- `commercial-records.use-case.test.ts`
  - active expired quote transitions to `EXPIRED`
  - non-expired quote cannot expire without force/system authority
  - accepted quote cannot expire
  - duplicate quote expiry returns stored ledger result
  - `quote.expired` outbox event includes `transitionLedgerId`
  - batch expiry calls per-quote transitions and does not call `updateMany`
  - batch expiry collects partial failures
  - stale `STARTED` ledgers become `FAILED` with `TRANSITION_TIMEOUT`
  - non-stale/completed ledgers are untouched
- `quotes.service.test.ts`
  - lower-level `expireQuotes(...)` is disabled and does not call `updateMany`

### Prisma Migration Deploy Issue Status

- The `CpqTransitionLedger` migration remains additive and SQL-valid.
- Prior migration dry-run against Docker PostgreSQL succeeded inside `BEGIN ... ROLLBACK`.
- Prisma `migrate deploy` still needs environment-specific schema-engine resolution; this is documented separately and did not block code hardening.

### Verification Run For This Slice

- `pnpm --filter @nexus/finance-service test -- quotes.service.test.ts commercial-records.use-case.test.ts cpq-transitions.routes.test.ts`
- `pnpm --filter @nexus/finance-service typecheck`

### Remaining Risks

- The reconciliation utility is not yet attached to a scheduler/admin job route.
- Forced expiry has a service-level authority check, but broader role-policy enforcement should eventually come from the shared policy engine.
- Full ledger + mutation + outbox single-transaction consistency remains limited by existing service boundaries.

### Next Recommended Slice

Wire stuck-transition reconciliation into the platform job scheduler/admin operations surface, then finish the CPQ read-model projection so finance-owned quote events update CRM/deal/contact/account timelines without any mutation authority leaking back into those modules.

## CPQ Reconciliation Operations and Quote Read-Model Projection

### Reconciliation Operations Path Added

- Added finance internal operations route:
  - `POST /api/v1/internal/cpq/reconcile-transitions`
- The route calls `reconcileStuckCpqTransitions(...)` and does not mutate CPQ aggregates directly.
- This is an internal service/job path only, intended for scheduler/admin operations.

### Access Control And Safety Rules

- Requires `x-service-token` to match `INTERNAL_SERVICE_TOKEN`.
- Accepts optional `tenantId`; otherwise uses `x-tenant-id` when supplied.
- Enforces `olderThanMinutes >= 5`.
- Caps `limit` at 500 even if callers request more.
- Does not auto-retry stuck transitions.
- Marks stale `STARTED` ledgers as `FAILED` with `TRANSITION_TIMEOUT`.
- Response includes structured counts plus `correlationId`.

### Projection Location Decision

- Chosen approach: deals-service read-model projection.
- Rationale:
  - Finance-service remains authoritative for RFQ/quote/DRQ/order mutations.
  - Deals/CRM screens need local queryable read models by deal/account/contact.
  - The old deals `Quote` writer remains disabled and is not re-used.
- New projection is explicitly named `QuoteProjection` so it cannot be confused with authoritative finance `Quote`.

### Projection Model And Handler

- Added `QuoteProjection` in `services/deals-service/prisma/schema.prisma`.
- Added `QuoteProjectionEvent` as a processed-event ledger so duplicate older events are skipped even after later events update the projection row.
- Added migration:
  - `services/deals-service/prisma/migrations/20260520130000_quote_projection/migration.sql`
- Added projection service:
  - `services/deals-service/src/services/quote-projections.service.ts`
- Added event consumer:
  - `services/deals-service/src/consumers/quote-projection.consumer.ts`
- The consumer handles finance quote events including:
  - `quote.created_from_rfq`
  - `quote.submitted_for_approval`
  - `quote.approved`
  - `quote.rejected`
  - `quote.sent`
  - `quote.signature_requested`
  - `quote.signed`
  - `quote.accepted`
  - `quote.expired`
  - `quote.voided`
  - `quote.converted_to_order`
  - `quote.revision_created`

### Idempotency Strategy

- Projection is idempotent by `tenantId + sourceEventId`.
- `sourceEventId` is derived from finance event metadata first, then event id / transition ledger id fallback.
- `QuoteProjectionEvent` stores:
  - `sourceEventId`
  - `sourceEventVersion`
  - `financeEventType`
  - `transitionLedgerId`
  - `projectedAt`
- Projection never writes to the old deals `Quote` table.

### Read APIs

- Added read-only deals-service routes:
  - `GET /quote-projections/deal/:dealId`
  - `GET /quote-projections/account/:accountId`
  - `GET /quote-projections/contact/:contactId`
- These require quote read permission and only return projection data.
- No mutation endpoints were added.

### Timeline Integration Status

- Real-time quote socket fan-out already exists in `services/realtime-service/src/consumers/quote.consumer.ts`.
- This slice did not force CRM timeline persistence because the timeline write convention is still spread across CRM modules.
- Next timeline integration should consume the same finance events and write timeline entries with source event metadata, without invoking finance mutations.

### Tests Added Or Updated

- `internal-operations.routes.test.ts`
  - rejects public access
  - rejects too-low recovery threshold
  - caps high limits to 500
  - reconciles stale `STARTED` rows
  - returns structured counts/correlation id
- `quote-projections.service.test.ts`
  - creates projection from finance quote event
  - skips duplicate source events
  - reads projections by deal/account/contact
  - proves old authoritative quote create/update delegates are not called

### Verification Run For This Slice

- `pnpm --filter @nexus/finance-service test -- commercial-records.use-case.test.ts cpq-transitions.routes.test.ts internal-operations.routes.test.ts`
- `pnpm --filter @nexus/deals-service test -- quote-projections.service.test.ts quotes.service.test.ts`
- `pnpm --filter @nexus/finance-service typecheck`
- `pnpm --filter @nexus/deals-service typecheck`

### Remaining Risks

- The reconciliation route is available for an internal caller, but no scheduler has been configured to call it periodically yet.
- Deals-service projection migration must be deployed before the consumer is enabled in an environment with Kafka traffic.
- CRM timeline persistence still needs a dedicated event-to-timeline projector.

### Next Recommended Slice

Add the CRM timeline projector for quote/order/RFQ/DRQ events, then wire BFF read paths for contact/account/deal quote history to prefer `QuoteProjection` read APIs instead of stale legacy quote tables.

## CRM Timeline and Quote Projection Read Integration

### Reuse Map

- Existing owner service: `crm-service` owns durable customer timeline/history through `Activity` and existing account/contact/deal timeline endpoints.
- Existing route/use case to extend: CRM timeline projection extends the existing `Activity` model; web BFF account/contact/deal quote-history routes now call deals-service projection reads.
- Existing tables/models to reuse: `Activity.customFields` stores finance event metadata; deals-service `QuoteProjection` remains the read-only CPQ read model.
- Existing events/documents to reuse: finance quote/RFQ/DRQ/order domain events on `TOPICS.QUOTES`; no new document/event type was introduced.
- New additions absolutely required: `crm-service` finance timeline consumer/projector and targeted tests.
- Why they do not conflict: no new timeline table, no CPQ mutation route, no new UI surface, no parallel quote workflow. Finance-service remains mutation authority.

### Timeline Owner Reused

- Added `services/crm-service/src/consumers/finance-timeline.consumer.ts`.
- Wired it in `services/crm-service/src/server.ts` beside existing CRM consumers.
- The projector writes one CRM `Activity` row per finance event, anchored to any available `accountId`, `contactId`, and `dealId`.
- Idempotency is enforced by looking up `Activity.customFields.sourceEventId` before insertion.

### Events Projected

The projector accepts RFQ, quote, DRQ, and order lifecycle events including:

- `rfq.created`
- `rfq.reviewed`
- `rfq.converted_to_quote`
- `quote.created_from_rfq`
- `quote.revision_created`
- `quote.submitted_for_approval`
- `quote.approved`
- `quote.rejected`
- `quote.sent`
- `quote.signature_requested`
- `quote.signed`
- `quote.accepted`
- `quote.expired`
- `quote.voided`
- `quote.converted_to_order`
- `drq.requested`
- `drq.approved`
- `drq.rejected`
- `quote.discount_request.created`
- `order.created`
- `order.created_from_quote`

### Metadata Stored

Projected activities store:

- `timelineSource`
- `sourceEventId`
- `sourceEventType`
- `aggregateId`
- `aggregateType`
- `transitionLedgerId`
- `approvalRequestId`
- `quoteId`, `rfqId`, `drqId`, `orderId`
- quote/RFQ numbers, status, amount, and currency when available

### Quote-History Read Changes

- `apps/web/src/app/api/accounts/[id]/quotes/route.ts` now reads from `GET /api/v1/data/quote-projections/account/:accountId`.
- `apps/web/src/app/api/contacts/[id]/quotes/route.ts` now reads from `GET /api/v1/data/quote-projections/contact/:contactId`.
- `apps/web/src/app/api/deals/[[...path]]/route.ts` now routes non-preview `GET /deals/:id/quotes` to `GET /api/v1/data/quote-projections/deal/:dealId`.
- `services/crm-service/src/routes/deals.routes.ts` also routes `GET /deals/:id/quotes` to deals-service `QuoteProjection`.
- Removed the unused CRM `listDealQuotes` service method that read the legacy CRM `Quote` table.

### Tests Added

- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - `quote.approved` creates a timeline activity
  - `quote.sent` preserves finance metadata and does not mutate quote state
  - `drq.approved` creates timeline activity when CRM anchors exist
  - `order.created_from_quote` creates account/deal timeline activity without requiring contact
  - duplicate `sourceEventId` is skipped
  - missing CRM anchors are ignored
- `apps/web/src/app/api/quote-projection-history.routes.test.ts`
  - account quote history reads from `QuoteProjection`
  - contact quote history reads from `QuoteProjection`
  - deal quote history reads from `QuoteProjection`

### Cleanup Report

- Duplicate logic removed: CRM deal quote history no longer reads legacy CRM `Quote` records.
- Dead code removed: unused `listDealQuotes` method and `Quote` service import removed from CRM deals service.
- Routes consolidated: account/contact/deal quote-history reads point to deals-service `QuoteProjection`.
- Events consolidated: timeline projector consumes existing finance event names only.
- Models consolidated: no new timeline model or quote model added.
- Remaining technical debt: CRM timeline idempotency currently uses JSON lookup instead of a dedicated unique constraint; if duplicate Kafka delivery races are observed, add a source-event ledger or unique generated column.

### Verification Run For This Slice

- `pnpm --filter @nexus/crm-service test -- finance-timeline.consumer.test.ts`
- `pnpm --filter @nexus/deals-service test -- quote-projections.service.test.ts`
- `pnpm --filter @nexus/web test -- quote-projection-history.routes.test.ts`
- `pnpm --filter @nexus/crm-service typecheck`
- `pnpm --filter @nexus/deals-service typecheck`
- `pnpm --filter @nexus/web typecheck`
- `pnpm --filter @nexus/web build`
- `pnpm -r --if-present typecheck`

### Remaining Risks

- The CRM finance timeline consumer depends on `Activity.customFields` JSON filtering for idempotency, which is safe in tests but less strong than a database-level unique constraint.
- BFF quote-history reads now require deals-service `QuoteProjection` routes to be deployed and reachable.
- Timeline labels are intentionally compact; UI can later render finance-sourced activities with a dedicated icon/badge without changing the projection contract.

### Next Recommended Slice

Add a small projection health monitor for `QuoteProjection` and CRM timeline lag, then harden quote-history UI states so stale/missing projections are shown as read-model sync delays rather than CPQ data loss.

## Read-Model Observability and Legacy Quote Read Retirement

### Reuse Map

- Existing health check owner/pattern: service-local `/health`, `/ready`, and `/metrics` via `registerHealthRoutes`, plus internal service-token projection health routes.
- Existing metrics/observability route: deals-service owns `services/deals-service/src/routes/health.routes.ts`; crm-service owns service-token internal routes in `services/crm-service/src/routes/internal.routes.ts`.
- Existing CRM GraphQL quote read resolvers: crm-service GraphQL no longer exposes `Query.quote` or `Query.quotes`; `services/crm-service/src/graphql/resolvers.test.ts` covers this retirement.
- Existing deals QuoteProjection health/read paths: deals-service owns `QuoteProjection`, `QuoteProjectionEvent`, `createQuoteProjectionsService`, projection-backed read APIs, GraphQL quote reads backed by `quoteProjection`, and internal `/api/v1/internal/quote-projections/health`.
- Existing CRM Activity/timeline idempotency options: finance timeline projection reuses Activity `customFields`, application-level source-event lookup, P2002 duplicate handling, and the tenant-scoped partial unique expression index in `20260520143000_finance_timeline_activity_idempotency`.
- Existing event consumer offset/lag metadata: QuoteProjection health reports projection count, latest projected time, last processed source event id, freshness/lag estimate, consumer group, and DLQ topic; CRM finance timeline health reports projected Activity count, latest projection time, latest finance source event id/time, freshness/lag estimate, consumer group, and DLQ topic.
- New additions absolutely required: no runtime code additions were required in this verification pass; the existing owners already cover the requested health, lag, idempotency, and GraphQL retirement surfaces.
- Conflict risks: adding another observability service, quote read resolver, projection table, or Activity idempotency table would duplicate existing ownership and was intentionally avoided.

### QuoteProjection Health Behavior

- Added internal deals-service endpoint:
  - `GET /api/v1/internal/quote-projections/health`
- Protected by `x-service-token` matching `INTERNAL_SERVICE_TOKEN`.
- Supports tenant scoping from `tenantId` query or `x-tenant-id`.
- Reports:
  - `projectionCount`
  - `latestProjectedAt`
  - `latestSourceEventTime` as nullable
  - `lastProcessedSourceEventId`
  - `lagMs`
  - `consumerFreshnessMs`
  - `status`: `healthy`, `stale`, `degraded`, or `empty`
- Reuses `createQuoteProjectionsService(...)`; no new observability service was introduced.
- `latestSourceEventTime` remains nullable because current `QuoteProjection` and `QuoteProjectionEvent` rows do not persist canonical finance `occurredAt`; adding that field is a future schema/replay-compatible tranche.

### CRM Timeline Health Behavior

- Added internal CRM endpoint:
  - `GET /api/v1/internal/finance-timeline/health`
- Protected by the existing CRM service-token pattern.
- Reads existing finance-sourced `Activity` rows where `customFields.timelineSource = finance`.
- Reports:
  - `projectedEventCount`
  - `latestProjectedAt`
  - `latestSourceEventTime`
  - `latestSourceEventId`
  - `lagMs`
  - `consumerFreshnessMs`
  - `status`: `healthy`, `stale`, `degraded`, or `empty`

### Timeline Idempotency Decision

- Kept the existing hardened design; no new table, shadow timeline system, or projection ledger was added.
- New finance Activity rows written with `customFields.timelineSource = finance`, `projectionIdempotencyVersion = 1`, and stable `sourceEventId` are protected by the PostgreSQL partial unique expression index on `tenantId + sourceEventId`.
- Historical rows remain governed by the existing readiness, dry-run planning, approved executor, audit history, consistency, orphan reporting, and runbook flow.

### CRM GraphQL Legacy Quote Read Changes

- CRM GraphQL no longer exposes `Query.quote` or `Query.quotes`.
- CRM GraphQL no longer reads from legacy CRM `Quote` repository/table.
- Account/contact/deal quote history remains served through deals-service `QuoteProjection` APIs.
- deals-service GraphQL quote reads are projection-backed through `QuoteProjection`.
- The schema currently does not advertise quote fields, so no GraphQL schema deprecation annotation was required.

### Tests Added Or Updated

- No new tests were necessary in this verification pass because the requested behavior already had focused coverage.
- Existing coverage re-run: `services/deals-service/src/services/quote-projections.service.test.ts`
  - healthy projection health
  - stale projection health
  - empty projection health
- `services/deals-service/src/routes/health.routes.test.ts`
  - internal projection health rejects public access
  - returns scoped projection health
- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - healthy/stale/empty timeline health
  - duplicate source event remains skipped
- `services/crm-service/src/routes/internal.routes.test.ts`
  - internal timeline health rejects public access
  - returns recent timeline health
- `services/crm-service/src/graphql/resolvers.test.ts`
  - legacy quote read resolvers are not exposed

### Cleanup Report

- Duplicate logic removed: none introduced.
- Dead code removed: none.
- Routes consolidated: existing internal health routes were reused.
- Events consolidated: no new finance event names were created.
- Models consolidated: no new QuoteProjection, timeline model, idempotency ledger, or observability service was added.
- Risky legacy code intentionally retained: `latestSourceEventTime` for QuoteProjection remains nullable until canonical source event time is persisted in the projection schema.
- Remaining technical debt: QuoteProjection source-event-time lag can be improved by a future schema/replay-compatible migration.

### Verification Run For This Slice

- `pnpm --filter @nexus/deals-service test -- quote-projections.service.test.ts health.routes.test.ts`
- `pnpm --filter @nexus/crm-service test -- finance-timeline.consumer.test.ts internal.routes.test.ts resolvers.test.ts`
- `pnpm --filter @nexus/deals-service typecheck`
- `pnpm --filter @nexus/crm-service typecheck`
- `pnpm --filter @nexus/web typecheck`
- `pnpm --filter @nexus/web build`
- `pnpm -r --if-present typecheck`

### Remaining Risks

- Projection lag is based on latest projected rows, not Kafka consumer group lag.
- QuoteProjection health freshness is based on projection time, not canonical finance event occurrence time, because current projection tables do not store `occurredAt`.
- CRM GraphQL still exposes generic CRM entities and mutations unrelated to quote reads; those were not reviewed in this slice.

### Next Recommended Slice

Design a schema-compatible QuoteProjection source-event occurrence timestamp migration and replay plan, including backfill/readiness checks, before tightening lag SLOs that depend on canonical finance event time.

---

## Operational Observability and Projection Governance

### Reuse Map

- Existing observability owner reused:
  - Service-local health/readiness routes from `@nexus/service-utils`.
  - Deals-service owns `QuoteProjection` health.
  - CRM-service owns finance timeline health through `Activity`.
  - Finance-service owns CPQ transition ledger/reconciliation observability.
- Existing health/metrics routes reused:
  - `/health`, `/ready`, `/metrics` patterns remain unchanged.
  - Existing internal service-token route style is reused for projection and CPQ operations.
- Existing Kafka/DLQ/replay patterns reused:
  - `NexusConsumer` retry/DLQ behavior remains the consumer failure mechanism.
  - `outbox-relay` remains the DLQ stats/replay owner through `/admin/dlq/stats` and `/admin/dlq/replay`.
- Existing projection metadata reused:
  - Deals-service `QuoteProjection` / `QuoteProjectionEvent`.
  - CRM-service `Activity.customFields`.
- New additions absolutely required:
  - Additive projection metadata fields in deals-service projection schema.
  - Internal dry-run rebuild readiness endpoint for quote projections.
  - Internal CPQ observability endpoint for stale `STARTED` transition visibility.
- Conflict risks avoided:
  - No new observability platform.
  - No new replay engine.
  - No new timeline model.
  - No CPQ authority moved out of finance-service.

### Projection Metadata Standardization

Canonical projection metadata is now consistently written where the existing models can carry it:

- `sourceEventId`
- `sourceEventType`
- `sourceAggregateId`
- `sourceAggregateType`
- `sourceEventVersion`
- `transitionLedgerId`
- `projectedAt`
- `projectionVersion`
- `correlationId`
- `tenantId`

Deals-service stores this on `QuoteProjection` and `QuoteProjectionEvent`. CRM-service stores equivalent metadata in finance-sourced `Activity.customFields`.

### Lag And Health Behavior

- QuoteProjection health now reports `healthy`, `stale`, `degraded`, or `empty`.
- CRM finance timeline health now reports `healthy`, `stale`, `degraded`, or `empty`.
- Both health payloads include consumer freshness hints, consumer group name, and DLQ topic.
- Degraded status is emitted when latest projection freshness is beyond 2x the configured stale threshold.

### Replay/Rebuild Readiness

- Added a dry-run-only quote projection rebuild readiness path:
  - `GET /api/v1/internal/quote-projections/rebuild-readiness`
- The endpoint reads existing `QuoteProjectionEvent` rows and reports replay candidates.
- It intentionally returns `safeToReplay: false`; actual replay remains a future governed operation.

### DLQ And Failure Visibility

- Finance-service internal CPQ observability now exposes stale `STARTED` transition counts.
- The response points operators to the existing outbox-relay DLQ stats and replay routes instead of creating another DLQ surface.

### Consumer Discipline Cleanup

- Quote projection and finance timeline consumers remain read-model projectors only.
- No authoritative CPQ state is mutated by deals-service or CRM-service.
- Event mapping now keeps source aggregate/correlation metadata consistent across projections.

### Event Governance Updates

- Projection event metadata now carries `projectionVersion`.
- Finance event correlation and transition ledger metadata are preserved when present.
- Canonical finance event names remain documented in the projector allowlists; no new event names were introduced.

### Metrics Added

- No new Prometheus collectors were added in this slice.
- Existing `/metrics` exposure remains the owner for service metrics.
- Projection-specific operational visibility is exposed through internal health/readiness endpoints.

### Tests Added Or Updated

- `services/deals-service/src/services/quote-projections.service.test.ts`
  - canonical metadata projection
  - degraded health classification
  - dry-run rebuild readiness
- `services/deals-service/src/routes/health.routes.test.ts`
  - quote projection rebuild-readiness route
- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - canonical timeline metadata
  - degraded health classification
- `services/finance-service/src/routes/internal-operations.routes.test.ts`
  - internal CPQ observability and stale transition visibility

### Cleanup Report

- Duplicate logic removed: none introduced by this tranche.
- Dead code removed: none.
- Routes consolidated: all new surfaces use existing internal health/operations route owners.
- Events consolidated: no new CPQ event names were added.
- Models consolidated: no duplicate quote read model or timeline system was introduced.
- Remaining technical debt:
  - QuoteProjection replay is readiness-only and needs a future approved replay design.
  - CRM timeline idempotency remains application-level JSON lookup until a DB-safe uniqueness strategy is approved.
  - Kafka consumer group lag is inferred from projection freshness, not broker offsets.

### Remaining Risks

- Projection lag is operationally visible but not yet tied to Kafka partition lag.
- Stale consumer detection depends on latest projection timestamps; a quiet tenant can appear empty/stale without event-rate context.
- DLQ visibility remains split between service health endpoints and outbox-relay admin endpoints.

### Next Recommended Slice

Add governed replay execution with explicit dry-run approval, source event range selection, and reconciliation audit records, while keeping projection rebuilds read-model-only.

---

## Governed Projection Replay Execution

### Reuse Map

- Existing replay/outbox/DLQ/retry owner reused:
  - `@nexus/kafka` remains the Kafka retry/DLQ owner.
  - `services/outbox-relay` remains the durable outbox/DLQ stats and replay owner.
- Existing internal/admin route pattern reused:
  - Deals-service internal service-token routes under `/api/v1/internal/quote-projections/*`.
  - CRM-service internal service-token routes under `/api/v1/internal/finance-timeline/*`.
- Existing audit/logging model:
  - No shared durable operator replay audit table exists across deals/CRM.
  - This slice returns structured operator reports and documents the durable audit gap.
- Existing QuoteProjection rebuild-readiness endpoint:
  - Extended the same owner instead of adding a replay service.
- Existing CRM finance timeline projection owner:
  - Extended `services/crm-service/src/consumers/finance-timeline.consumer.ts` and internal routes.
- Existing source event storage:
  - Deals-service `QuoteProjectionEvent` is a processed projection ledger, not a canonical finance source-event store.
  - CRM-service `Activity` rows are timeline projections, not canonical source events.
- New additions absolutely required:
  - Governed replay contract/report types.
  - Internal replay reporting endpoints.
- Conflict risks avoided:
  - No new replay platform.
  - No new source-event shadow table.
  - No CPQ mutation replay.
  - No new quote authority.
  - No new UI page.

### Source Event Storage Availability Decision

Replay execution is intentionally unsupported in this slice.

Reason: neither deals-service nor CRM-service has durable canonical finance source event payload storage suitable for reconstructing read models. Using `QuoteProjectionEvent` or `Activity` as a source would replay from projections rather than source events, which risks incomplete or misleading reconstruction.

### Replay Contract

Both read-model owners now accept the governed replay request shape:

- `projection`
- `tenantId`
- `fromOccurredAt`
- `toOccurredAt`
- `fromEventId`
- `toEventId`
- `aggregateId`
- `sourceEventTypes`
- `dryRun`
- `reason`
- `operatorId`

Rules enforced now:

- Internal service-token access only.
- `reason` is required.
- `dryRun` defaults to `true`.
- Reports include operator, reason, filters, counts, timestamps, status, warnings, and errors.

### QuoteProjection Replay Behavior

- Added internal route:
  - `POST /api/v1/internal/quote-projections/replay`
- The route returns a governed report with:
  - `projection: quoteProjection`
  - `status: unsupported`
  - `sourceEventStorageAvailable: false`
- It does not mutate authoritative finance `Quote`.
- It does not mutate `QuoteProjection`; execution waits for a safe canonical event source.

### Finance Timeline Replay Behavior

- Added internal route:
  - `POST /api/v1/internal/finance-timeline/replay`
- The route returns a governed report with:
  - `projection: financeTimeline`
  - `status: unsupported`
  - `sourceEventStorageAvailable: false`
- It does not mutate CPQ aggregates.
- It does not create duplicate timeline systems or tables.

### Operator Audit / Reporting

Each replay attempt returns a structured report:

- `operationId`
- `projection`
- `dryRun`
- `tenantId`
- `operatorId`
- `reason`
- `filters`
- count summary
- `startedAt`
- `completedAt`
- `status`
- warnings/errors

Durable operator-audit persistence remains a future platform decision because no shared replay-operation audit table exists.

### Safety Checks

- Service-token/internal-only access.
- Required reason.
- Dry-run defaults to true.
- Unsupported execution when source storage is unavailable.
- No authoritative aggregate mutation.
- No CPQ mutation events emitted.
- Read-model-only posture preserved.

### Tests Added

- `services/deals-service/src/services/quote-projections.service.test.ts`
  - unsupported governed replay report
  - no authoritative quote mutation
- `services/deals-service/src/routes/health.routes.test.ts`
  - replay rejects missing reason
  - replay defaults to dry-run and reports unsupported execution
- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - unsupported governed finance timeline replay report
  - no CPQ mutation
- `services/crm-service/src/routes/internal.routes.test.ts`
  - replay rejects missing reason
  - replay defaults to dry-run and reports unsupported execution

### Cleanup Report

- Duplicate logic removed: none introduced.
- Dead code removed: none.
- Routes consolidated: replay reporting extends existing internal route owners.
- Events consolidated: no new events introduced.
- Models consolidated: no new replay tables, quote tables, or timeline tables.
- Remaining technical debt:
  - Need a canonical durable finance event store or approved outbox replay adapter before execution can be enabled.
  - Durable operator replay audit should be standardized across services before persistent replay logs are added.

### Remaining Risks

- Projection replay remains reporting-only until canonical event source access is implemented.
- Operator reports are returned to caller but not durably persisted.
- Source event range filters are accepted and reported but not executed because source storage is unavailable.

### Next Recommended Slice

Design the canonical event-source access contract for read-model replays, most likely as a governed outbox-relay adapter that can stream canonical finance outbox events to projection owners without giving them mutation authority.

---

## Canonical Finance Event-Source Access Contract

### Reuse Map

- Existing finance outbox owner reused:
  - `finance-service` owns authoritative CPQ mutation outbox emission.
- Existing outbox table/model reused:
  - `finance-service` `OutboxMessage`.
- Existing outbox relay/service reused:
  - `outbox-relay` remains responsible for publishing, DLQ stats, and DLQ replay.
- Existing event envelope fields reused:
  - `id`, `eventType`, `tenantId`, `aggregateType`, `aggregateId`, `payload`, `correlationId`, `headers`, `createdAt`.
- Existing internal route/security pattern reused:
  - `x-service-token` protected internal routes under `finance-service` `/api/v1/internal/*`.
- Existing projection consumers reused:
  - Deals-service `QuoteProjection` projector/readiness.
  - CRM-service finance timeline projector/readiness.
- New additions absolutely required:
  - Read-only finance event-source query endpoint.
  - Projection-owner event-source availability probes.
- Why they do not conflict:
  - The endpoint reads existing finance outbox rows only.
  - It never mutates outbox state, republishes events, or changes finance aggregates.
  - Projection owners receive availability and candidate counts only; replay execution remains disabled.

### Chosen Implementation Option

Option A was chosen: extend `finance-service` internal operations routes with:

- `GET /api/v1/internal/events/finance`

This keeps canonical finance events under the authoritative finance context and avoids creating a parallel event platform.

### Endpoint Contract

Supported filters:

- `tenantId` or `x-tenant-id`
- `eventType`
- `aggregateType`
- `aggregateId`
- `fromOccurredAt`
- `toOccurredAt`
- `fromEventId`
- `toEventId`
- `limit`, capped to 500

Canonical response envelope:

- `eventId`
- `eventType`
- `tenantId`
- `aggregateType`
- `aggregateId`
- `occurredAt`
- `correlationId`
- `idempotencyKey`
- `transitionLedgerId`
- `source`
- `payload`

### Security And Filter Rules

- Internal/service-token only.
- Tenant scope is required.
- At least one event filter is required to prevent broad unbounded reads.
- Limit is capped to 500.
- Query is read-only.
- No event republish endpoint was added.
- No outbox status/retry fields are modified.

### Projection Readiness Integration

- Deals-service governed quote projection replay reports can now probe a configured finance event-source endpoint.
- CRM-service finance timeline replay reports can now probe a configured finance event-source endpoint.
- Probe configuration:
  - `FINANCE_EVENT_SOURCE_URL`
  - `INTERNAL_SERVICE_TOKEN`
- Reports include:
  - `eventSourceAvailable`
  - `eventSourceEndpoint`
  - `candidateCount`
- Replay execution remains disabled until the next governed slice.

### Tests Added Or Updated

- `services/finance-service/src/routes/internal-operations.routes.test.ts`
  - rejects unauthorized event-source access
  - rejects unfiltered broad query
  - filters finance events and caps limit
  - returns canonical event envelope
  - does not mutate outbox rows
- `services/deals-service/src/services/quote-projections.service.test.ts`
  - reports configured event-source availability and candidate count
- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - reports configured event-source availability and candidate count

### Cleanup Report

- Duplicate logic removed: none introduced.
- Dead code removed: none.
- Routes consolidated: finance event source is under existing finance internal operations.
- Events consolidated: no new event names introduced.
- Models consolidated: no new outbox, source event, quote, projection, or timeline tables.
- Remaining technical debt:
  - Event-source probes are implemented independently in deals/CRM route owners; a future shared internal-client helper may be useful if more projection owners need this.
  - The read route is source-access only; replay execution remains a separate governed slice.

### Remaining Risks

- Event access is based on finance outbox retention; replay range is only as good as retained outbox history.
- Pagination is currently limit-based, with event ID/time filters available for caller-managed pagination.
- Projection owners still do not execute replay.

### Next Recommended Slice

Implement read-model replay execution using the new finance event-source endpoint, still dry-run-first and read-model-only, with per-event idempotency and an operator report.

---

## Governed Read-Model Replay Execution

### Reuse Map

- Existing finance event-source endpoint/client/probe reused:
  - `finance-service` `GET /api/v1/internal/events/finance`.
  - Deals-service and CRM-service internal replay routes now use the existing finance event-source probes to fetch canonical event envelopes.
- Existing QuoteProjection projector reused:
  - `services/deals-service/src/services/quote-projections.service.ts` `projectFinanceQuoteEvent(...)`.
- Existing CRM finance timeline projector reused:
  - `services/crm-service/src/consumers/finance-timeline.consumer.ts` `projectFinanceTimelineEvent(...)`.
- Existing replay reporting endpoints reused:
  - `POST /api/v1/internal/quote-projections/replay`.
  - `POST /api/v1/internal/finance-timeline/replay`.
- Existing internal route/service-token pattern reused:
  - `x-service-token`, `x-tenant-id`, and `x-operator-id`.
- Existing projection idempotency storage reused:
  - Deals-service `QuoteProjectionEvent`.
  - CRM-service `Activity.customFields.sourceEventId`.
- Existing operator audit/log pattern:
  - No shared durable internal replay audit table exists yet, so replay attempts return structured operation reports.
- New additions absolutely required:
  - Event-source probes now return canonical source events, not only candidate counts.
  - Governed replay loops classify and optionally execute events through existing projectors.
- Why they do not conflict:
  - Replay writes only read-model projection rows or CRM Activity rows.
  - Replay does not mutate finance aggregates, republish events, or introduce new projection tables/services.

### Replay Execution Contract

Both existing internal endpoints now accept:

- `tenantId`
- `fromOccurredAt`
- `toOccurredAt`
- `fromEventId`
- `toEventId`
- `aggregateId`
- `aggregateType`
- `sourceEventTypes`
- `limit`, capped to 500
- `dryRun`, default `true`
- `execute`, default `false`
- `reason`, required

Execution only occurs when `dryRun=false` and `execute=true`; otherwise the request classifies candidates without writes.

### Finance Event-Source Usage

Projection owners fetch canonical finance event envelopes through the finance internal event-source route and convert those envelopes into the existing projector event shape. Canonical source metadata wins over embedded payload metadata for replay-critical fields such as `sourceEventId`, `transitionLedgerId`, `correlationId`, and `idempotencyKey`.

### QuoteProjection Replay Behavior

- Eligible quote events are classified from the canonical source event payload.
- Dry-run reports candidate/create/update/duplicate/skip counts without writing.
- Execution calls `projectFinanceQuoteEvent(...)`.
- Duplicate `sourceEventId` rows in `QuoteProjectionEvent` are skipped.
- Unsupported events and events missing `quoteId` are skipped with warnings.
- Authoritative `Quote` is never created or updated.

### CRM Finance Timeline Replay Behavior

- Eligible RFQ/quote/DRQ/order events are classified from the canonical source event payload.
- Dry-run reports candidate/create/duplicate/skip counts without writing.
- Execution calls `projectFinanceTimelineEvent(...)`.
- Duplicate `Activity.customFields.sourceEventId` entries are skipped.
- Events without CRM anchors are skipped with warnings.
- Only CRM `Activity` timeline entries are written.

### Operator Report Shape

Replay reports include:

- `operationId`
- `projection`
- `dryRun`
- `executed`
- `tenantId`
- `operatorId`
- `reason`
- `filters`
- `sourceEventAccess`
- `counts`
- `warnings`
- `errors`
- `startedAt`
- `completedAt`
- `status`

Statuses are `dry_run`, `completed`, `completed_with_warnings`, `failed`, or `unsupported`.

### Safety Checks

- Internal/service-token route protection remains in place.
- `reason` remains required.
- Dry-run is the default.
- `execute=true` alone is insufficient if `dryRun` remains true.
- Limit is capped to 500.
- No replay path calls CPQ mutation commands.
- No replay path republishes events.
- Unsupported events are skipped with warnings.
- Idempotency is enforced by existing projection ledgers/lookups.

### Tests Added Or Updated

- `services/deals-service/src/services/quote-projections.service.test.ts`
  - dry-run does not write projections
  - execution processes eligible events through the existing projector
  - duplicate source events are skipped
  - source availability now reports `dry_run` instead of unsupported when canonical events are available
- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - dry-run does not write Activity
  - execution writes Activity only through the existing projector
  - duplicate source events are skipped
  - source availability now reports `dry_run` instead of unsupported when canonical events are available
- Existing internal route tests for service-token and reason validation still pass.

### Cleanup Report

- Duplicate logic removed: none introduced.
- Dead code removed: none.
- Routes consolidated: replay remains on existing projection-owner internal routes.
- Events consolidated: no new finance events introduced.
- Models consolidated: no new projection, replay, source-event, quote, or timeline tables.
- Remaining technical debt:
  - Durable operator replay audit is still a gap because no shared internal operation audit table was found.
  - Finance event-source probes are duplicated between deals-service and CRM-service; a shared internal client may be worthwhile after one more projection owner appears.

### Remaining Risks

- Replay capacity depends on finance outbox retention and filter coverage.
- Replay currently fetches one event type per event-source call; callers should scope replays narrowly or iterate event types until a shared client supports multi-event fanout.
- CRM timeline idempotency remains application-level JSON lookup, not a database unique constraint.

### Next Recommended Slice

Add durable operator audit for internal replay/reconciliation operations, preferably by reusing or extending the existing audit infrastructure rather than introducing a new audit store.

---

## Durable Operator Audit for Replay and Reconciliation

### Reuse Map

- Existing audit owner reused:
  - `@nexus/audit` remains the audit contract package.
  - `audit-consumer` remains the durable audit-log writer.
- Existing audit table/model reused:
  - `services/audit-consumer/prisma/schema.prisma` `AuditLog`.
- Existing audit event envelope reused:
  - `AuditEvent` with `tenantId`, `actorId`, `actorType`, `action`, `resource`, `resourceId`, `metadata`, and `correlationId`.
- Existing internal operation route owners reused:
  - Finance-service internal operations routes.
  - Deals-service internal QuoteProjection routes.
  - CRM-service internal finance timeline routes.
- New additions absolutely required:
  - A shared sanitized internal-operation audit event builder/publisher in `@nexus/audit`.
  - Best-effort audit publication from replay/reconciliation routes.
- Why they do not conflict:
  - No audit table or audit service was added.
  - Audit events flow through the existing `nexus.compliance.audit` topic and durable audit consumer.
  - Audit writes do not mutate CPQ, QuoteProjection, or CRM Activity authority.

### Operation Audit Contract

Internal operation audit events use:

- `action`: operation type, such as `cpq.transition.reconcile`, `quoteProjection.replay`, or `financeTimeline.replay`
- `resource`: `internal_operation`
- `resourceId`: operation id
- `actorId`: operator or `system`
- `actorType`: `service` or `system`
- `tenantId`
- `correlationId`
- sanitized metadata:
  - `operationType`
  - `operationId`
  - `dryRun`
  - `executed`
  - `reason`
  - `filters`
  - `counts`
  - `status`
  - `warnings`
  - `errors`
  - `startedAt`
  - `completedAt`
  - `sourceService`
  - `targetProjection` or `targetDomain`
  - `sourceEventIds`

### Operations Wired

- Finance:
  - `POST /api/v1/internal/cpq/reconcile-transitions` emits `cpq.transition.reconcile`.
- Deals:
  - `POST /api/v1/internal/quote-projections/replay` emits `quoteProjection.replay`.
- CRM:
  - `POST /api/v1/internal/finance-timeline/replay` emits `financeTimeline.replay`.

Read-only observability and finance event-source query routes were not audited in this slice to avoid high-volume audit noise. They can be added later behind a separate policy if required.

### Audit Failure Behavior

Audit publication is best-effort:

- successful replay/reconciliation is not blocked by an audit publish outage
- a deterministic warning is appended to the operation report: `Audit publish failed: ...`
- unauthorized requests and validation failures return before audit publication

### Sensitive Data Policy

Audit metadata stores operation filters, counts, status, warnings/errors, and source event ids only. It does not store canonical finance event payloads, customer payloads, or replay source-event bodies.

### Tests Added Or Updated

- `packages/audit/src/__tests__/audit.test.ts`
  - validates sanitized internal-operation audit event construction
  - verifies payload/source-event bodies are not stored
- `services/finance-service/src/routes/internal-operations.routes.test.ts`
  - verifies CPQ reconciliation emits sanitized audit
- `services/deals-service/src/routes/health.routes.test.ts`
  - verifies QuoteProjection replay emits sanitized audit
  - verifies audit publish failure is non-blocking and reported as warning
- `services/crm-service/src/routes/internal.routes.test.ts`
  - verifies finance timeline replay emits sanitized audit

### Cleanup Report

- Duplicate logic removed: none introduced.
- Dead code removed: none.
- Routes consolidated: audit is wired into existing internal operation routes only.
- Events consolidated: a single audit action event type `internal.operation.audited` is published to the existing audit topic.
- Models consolidated: no new audit or operation table.
- Remaining technical debt:
  - Deals-service and CRM-service still have separate finance event-source probe helpers.
  - Finance event-source query auditing remains intentionally deferred pending policy.

### Remaining Risks

- Durable audit depends on Kafka and the existing audit-consumer being healthy.
- Audit publication is best-effort by design; if enterprise policy later requires hard-fail audit, the route behavior must be tightened.

### Next Recommended Slice

Add policy-controlled audit requirements for internal operations, including which operations must hard-fail on audit outage versus best-effort warn-only behavior.

---

## Policy-Controlled Audit Strictness

### Reuse Map

- Existing owner service/package:
  - `@nexus/audit` remains the audit contract and publishing helper package.
- Existing route/use case extended:
  - Finance-service `POST /api/v1/internal/cpq/reconcile-transitions`.
  - Deals-service `POST /api/v1/internal/quote-projections/replay`.
  - CRM-service `POST /api/v1/internal/finance-timeline/replay`.
- Existing tables/models reused:
  - Existing audit consumer `AuditLog` through the current audit stream.
- Existing events/contracts reused:
  - `internal.operation.audited` on `nexus.compliance.audit`.
- New additions absolutely required:
  - `resolveAuditStrictness(...)` in `@nexus/audit`.
  - `publishInternalOperationAuditWithPolicy(...)` in `@nexus/audit`.
- Why they do not conflict:
  - No audit table, audit service, UI, replay workflow, or mutation path was added.
  - Strictness only controls whether an existing internal operation may return success if audit publication fails.

### Strictness Config

Default behavior remains warn-only unless explicitly configured:

- `AUDIT_STRICTNESS_DEFAULT=warn|strict`
- `AUDIT_STRICTNESS_CPQ_RECONCILE=warn|strict`
- `AUDIT_STRICTNESS_QUOTE_PROJECTION_REPLAY=warn|strict`
- `AUDIT_STRICTNESS_FINANCE_TIMELINE_REPLAY=warn|strict`

Per-operation configuration takes precedence over `AUDIT_STRICTNESS_DEFAULT`. Invalid values fall back to `warn` and emit a warning.

### Operation Defaults

- `cpq.transition.reconcile`: warn by default.
- `quoteProjection.replay`: warn by default.
- `financeTimeline.replay`: warn by default.

### Warn Behavior

If audit publication fails with warn strictness:

- The operation response remains successful.
- The operation report includes `Audit publish failed: ...`.
- No CPQ aggregate mutation is introduced by the audit path.

### Strict Behavior

If audit publication fails with strict strictness:

- The route returns a failure response with `AUDIT_REQUIRED_FAILED`.
- The returned report status is marked `audit_required_failed`.
- The operation must not claim full success when durable audit publication was required but unavailable.

### Consistency Note

Strict auditing happens after the route has built the operation report and, for executed replay/reconciliation, may occur after read-model or ledger recovery writes have completed. This avoids introducing an audit-first shadow transaction across services. If enterprise policy requires pre-commit audit reservations, that should be a future audit-consumer/outbox-level capability rather than route-local logic.

### Tests Added Or Updated

- `packages/audit/src/__tests__/audit.test.ts`
  - default strictness is warn.
  - per-operation override beats global default.
  - invalid config falls back to warn.
  - warn audit publish failure returns a warning.
  - strict audit publish failure throws `AUDIT_REQUIRED_FAILED`.
- `services/finance-service/src/routes/internal-operations.routes.test.ts`
  - strict audit failure blocks CPQ transition reconciliation response.
- `services/deals-service/src/routes/health.routes.test.ts`
  - strict audit failure blocks QuoteProjection replay response.
- `services/crm-service/src/routes/internal.routes.test.ts`
  - strict audit failure blocks finance timeline replay response.

### Cleanup Report

- Duplicate logic introduced: none.
- Dead code removed: none.
- Routes consolidated: existing internal operation routes only.
- Events consolidated: existing audit event stream only.
- Models consolidated: no schema change.
- Ownership boundaries preserved:
  - `@nexus/audit` owns audit strictness policy.
  - Finance/deals/CRM routes only invoke the shared policy-aware helper.

### Remaining Risks

- Strict mode still cannot atomically couple audit publication with read-model writes across service boundaries.
- No persisted operation report table exists beyond the durable audit event stream.

### Next Recommended Slice

Add operator-facing audit visibility for replay/reconciliation outcomes through existing admin/internal read APIs, still backed by the audit consumer rather than a new audit store.

---

## Operator Audit Visibility for Replay and Reconciliation

### Reuse Map

- Existing owner service/package:
  - `services/audit-consumer` owns durable audit consumption and the `AuditLog` read model.
  - `@nexus/audit` remains the event contract and publisher.
- Existing route/use case extended:
  - `audit-consumer` previously exposed health only; it now exposes one internal read adapter for operation audit visibility.
- Existing tables/models reused:
  - `AuditLog` in `services/audit-consumer/prisma/schema.prisma`.
- Existing events/contracts reused:
  - `internal.operation.audited` records with resource `internal_operation`.
  - Operation actions `cpq.transition.reconcile`, `quoteProjection.replay`, and `financeTimeline.replay`.
- New additions absolutely required:
  - `GET /api/v1/internal/audit/internal-operations`.
  - A sanitization/query helper and focused route tests.
- Why they do not conflict:
  - No new audit service, table, event, UI page, or route group was introduced.
  - The new route reads only from the existing audit owner and returns a sanitized operator view.

### Audit Owner And Read Path Reused

`audit-consumer` remains the durable audit owner. The new internal route reads existing `AuditLog` rows where `resource = internal_operation` and the action is one of the supported replay/reconciliation operation types.

### Filters Supported

The read route supports:

- `tenantId`
- `operationType`
- `operationId`
- `operatorId`
- `sourceService`
- `targetDomain` / projection target
- `dryRun`
- `executed`
- `status`
- `correlationId`
- `from` / `to`
- `limit`
- `cursor`

Limits are capped at `500`, with default `100`.

### Access Control

- Route path: `GET /api/v1/internal/audit/internal-operations`
- Access is internal-only via `x-service-token`.
- Tenant scope is required through `tenantId` query parameter or `x-tenant-id`.
- Unsupported operation types are rejected.
- The route is JWT-skipped via the existing `publicPrefixes` hook but still requires the internal service token.

### Sanitized Response Policy

The route returns operator-visible report fields only:

- identifiers, operation type, operator, source service, target projection/domain
- dry-run/executed flags
- reason
- filter summary
- counts
- status
- warning/error summaries
- correlation and timing fields

It does not return raw `metadata`, `changes`, finance event payloads, source event arrays, or customer-sensitive payloads.

### Tests Added

- `services/audit-consumer/src/internal-operation-audit.routes.test.ts`
  - unauthorized access is rejected.
  - operation type, operation id, and correlation id filters are applied.
  - tenant scope is required.
  - limit is capped.
  - unsupported operation types are rejected.
  - sensitive payloads/raw metadata are not returned.
  - empty result shape is stable.

### Cleanup Report

- Duplicate logic introduced: none.
- Dead code removed: none.
- Routes consolidated: one internal read route under the audit owner.
- Events consolidated: existing `internal.operation.audited` contract only.
- Models consolidated: no schema change.
- Ownership boundaries preserved:
  - Finance/deals/CRM publish operation audit events.
  - Audit-consumer owns durable read visibility.

### Remaining Risks

- Correlation id may exist either on `AuditLog.correlationId` or inside `metadata.correlationId` depending on producer/header behavior, so the read route filters both.
- There is no admin UI wiring in this slice; the existing admin audit page can call this route through a future BFF/internal proxy if needed.

### Next Recommended Slice

Add an admin/BFF proxy for the existing admin audit page only if product wants operator UI access, keeping the backend source of truth in `audit-consumer`.

## Admin Audit UI Integration for Internal Operations

### Reuse Map

- Existing owner service/package: `services/audit-consumer` remains the durable audit owner for internal replay/reconciliation audit records.
- Existing route/use case to extend: `GET /api/v1/internal/audit/internal-operations` is reused through a web BFF proxy.
- Existing tables/models to reuse: audit-consumer `AuditLog`; no new audit storage was added.
- Existing events/contracts to reuse: sanitized `internal.operation.audited` records and existing replay/reconciliation operation action names.
- Existing UI surface to reuse: `apps/web/src/app/admin/audit/page.tsx`.
- New additions absolutely required: `GET /api/admin/audit/internal-operations` in web as a server-side proxy, plus route/UI tests.
- Why they do not conflict: the browser never calls audit-consumer directly, the service token stays server-side, and the UI reads sanitized audit records from the existing audit owner.

### BFF Route

Added `GET /api/admin/audit/internal-operations` under the existing web admin API namespace. It:

- requires existing admin access through `requireAdmin`.
- forwards only supported filters to audit-consumer.
- caps `limit` at `500`.
- sends `INTERNAL_SERVICE_TOKEN` only from the server.
- forwards tenant/user context through headers.
- returns a second-pass sanitized response shape.

Supported filters:

- `operationType`
- `operationId`
- `operatorId`
- `sourceService`
- `targetDomain`
- `dryRun`
- `executed`
- `status`
- `correlationId`
- `from` / `to`
- `limit`
- `cursor`

### UI Surface Reused

The existing admin audit page was converted from static sample data to an operator audit view for internal replay/reconciliation records. It supports:

- operation type filter.
- status filter.
- execution mode filter.
- search by operator, operation id, or correlation id.
- cursor pagination.
- CSV export of the sanitized table fields.
- permission-aware access messaging.
- empty, loading, and error states.

### Permission And Sanitization Policy

- UI access requires admin role or audit/admin permission from the existing auth store.
- Browser requests go only to the web BFF.
- The response does not expose service tokens, raw metadata, finance event payloads, source event payloads, or customer-sensitive payloads.
- Displayed data is limited to operation identifiers, operator/service ownership, target, mode, status, counts, reason, warning/error summaries, correlation id, and timing.

### Tests Added

- `apps/web/src/app/api/admin/audit/internal-operations/route.test.ts`
  - unauthorized access is rejected.
  - allowed filters are forwarded.
  - limit is capped.
  - service token is not exposed.
  - audit-consumer errors are handled.
  - raw payload fields are stripped.
- `apps/web/src/app/admin/audit/page.test.tsx`
  - records render in the existing admin audit page.
  - filters are forwarded to the BFF route.
  - empty state renders.
  - raw metadata/payload fields are not displayed.

### Cleanup Report

- Duplicate logic introduced: none.
- Dead code removed: replaced static placeholder audit data with the real internal operation audit view.
- Routes consolidated: one web admin proxy to the existing audit-consumer route.
- Events consolidated: no new audit event names were added.
- Models consolidated: no schema changes.
- Ownership boundaries preserved: audit-consumer owns durable audit reads; web only proxies and renders.

### Remaining Risks

- The admin page currently surfaces internal operation audit records only; if generic audit event browsing is still desired, it should be integrated as a tab/filter in the same page rather than a second audit UI.
- Real visual validation depends on `INTERNAL_SERVICE_TOKEN` and `AUDIT_CONSUMER_URL` being configured in the running web environment.

### Next Recommended Slice

Add a generic audit-event tab to the same admin audit page only if operators need both business audit logs and internal operation logs in one consolidated surface.

## CPQ Wiring Closure and Event Canonicalization

### Reuse Map

- Existing owner service/package: `services/finance-service` remains the authority for DRQ, quote signature, quote lifecycle, and order creation.
- Existing route/use case to extend: `cpq-transitions.routes.ts`, `commercial-records.use-case.ts`, `orders.routes.ts`, and deals GraphQL resolvers.
- Existing tables/models to reuse: `DiscountRequest`, `Quote`, `QuoteRevision`, `QuoteESignEnvelope`, `SalesOrder`, `CpqTransitionLedger`, `QuoteProjection`, and `QuoteProjectionEvent`.
- Existing events/contracts to reuse: canonical `drq.requested`, `quote.signature_requested`, `quote.signed`, `quote.converted_to_order`, and `emitCommercialEvent`.
- Existing workflow/transition to reuse: `transitionCpqEntity(...)` and `persistCpqTransition(...)`.
- Existing projection/read model to reuse: deals-service `QuoteProjection`; no new read model was added.
- New additions absolutely required: `submitDiscountRequestForApproval(...)` in the existing commercial use case, a manual-order guard, and GraphQL read mapping from `QuoteProjection` to the legacy `Quote` schema shape.
- Why they do not conflict: all changes deepen existing owners and remove duplicate authority; no new service, route family, table, event stream, or UI surface was introduced.
- Conflict risks: legacy quote GraphQL schema shape is broader than `QuoteProjection`, so non-authoritative fields are returned as safe defaults/nulls until the schema is versioned.

### DRQ Submit Transition

`drq.SUBMIT_FOR_APPROVAL` now calls finance-service authority instead of returning a shell response. It:

- validates current DRQ state, quote revision freshness, discount percent, reason code, reason notes, and winning probability.
- runs through `persistCpqTransition(...)` with a `CpqTransitionLedger` row.
- links an existing/provided approval request reference.
- keeps quote totals unchanged.
- emits canonical `drq.requested` with `transitionLedgerId` metadata.

### Canonical Signature Events

Signature events now use canonical CPQ names:

- signature request emits `quote.signature_requested`.
- signed envelope emits `quote.signed`.
- QuoteProjection and CRM timeline tests now verify `quote.signed` is consumed.

The deprecated `quote.esign.sent` / `quote.esign.signed` names are no longer primary finance-service emissions for these transitions.

### Duplicate Publisher Cleanup

Direct lower-level quote service event publishing for `quote.created`, `quote.sent`, `quote.accepted`, `quote.rejected`, and `quote.voided` was removed where the commercial/outbox layer already emits canonical business events. The lower service still persists quote artifacts but no longer publishes duplicate business lifecycle events.

### Order Route Classification

`POST /api/v1/orders` is classified as manual-order creation only. It now rejects any payload containing `quoteId`; quote-derived orders must use `quote.CONVERT_TO_ORDER` / `/api/v1/quotes/:id/convert-order` so conversion remains ledger-backed and idempotent.

### Deals GraphQL Quote Reads

Deals GraphQL quote reads now read from `QuoteProjection` instead of legacy `ctx.prisma.quote`. Quote mutations remain disabled with the existing CPQ authority error.

### Workflow Verification Table

| Workflow | Entry Point | Owner | Transition/Event | Projection | Audit/Outbox | Tests | Status |
|---|---|---|---|---|---|---|---|
| DRQ submit for approval | `POST /api/v1/cpq/transitions` | finance-service | `drq.SUBMIT_FOR_APPROVAL`, `drq.requested` | CRM timeline eligible | ledger + outbox | finance route/use-case tests | `WIRED_AND_TESTED` |
| Signature request | quote e-sign route / CPQ transition | finance-service | `quote.REQUEST_SIGNATURE`, `quote.signature_requested` | QuoteProjection/CRM eligible | ledger + outbox | finance tests | `WIRED_AND_TESTED` |
| Mark signed | quote e-sign route / CPQ transition | finance-service | `quote.MARK_SIGNED`, `quote.signed` | QuoteProjection + CRM timeline | ledger + outbox | finance/deals/CRM tests | `WIRED_AND_TESTED` |
| Quote-to-order | `/api/v1/quotes/:id/convert-order` | finance-service | `quote.CONVERT_TO_ORDER` | QuoteProjection/CRM eligible | ledger + outbox | finance tests | `WIRED_AND_TESTED` |
| Manual order | `POST /api/v1/orders` | finance-service | `order.created` | none | outbox | finance use-case test | `WIRED_AND_TESTED` |
| Deals GraphQL quote read | GraphQL `quotes` / `quote` | deals-service | read-only projection | `QuoteProjection` | none | deals GraphQL test | `WIRED_AND_TESTED` |

### Tests Added/Updated

- `services/finance-service/src/use-cases/__tests__/commercial-records.use-case.test.ts`
- `services/finance-service/src/routes/cpq-transitions.routes.test.ts`
- `services/finance-service/src/services/__tests__/quotes.service.test.ts`
- `services/deals-service/src/services/quote-projections.service.test.ts`
- `services/deals-service/src/graphql/resolvers.test.ts`
- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`

### Cleanup Report

- Duplicate logic removed: duplicate lower quote lifecycle event publishing was removed.
- Dead code removed: no public API or schema was deleted.
- Routes consolidated: existing CPQ transition route now delegates DRQ submit to commercial authority.
- Events consolidated: signature events normalized to canonical CPQ names.
- Models consolidated: no schema changes.
- Risky legacy code intentionally retained: the broad legacy GraphQL `Quote` type remains for compatibility but is backed by `QuoteProjection`.

### Remaining Risks

- RFQ review/respond/ready workflow is still thin and intentionally deferred.
- CRM finance timeline idempotency is still application-level JSON lookup and intentionally deferred.
- `DiscountRequest` creation still emits `quote.discount_request.created` for compatibility; the new ledger-backed submit emits canonical `drq.requested`.

### Next Recommended Slice

Harden RFQ review/respond/ready transitions with the same ledger-backed transition model, then add DB-level idempotency for CRM finance timeline projection.

## RFQ Review / Respond / Ready Transition Hardening

### Reuse Map

- Existing RFQ owner service: `services/finance-service`, inside the existing commercial records use case.
- Existing RFQ routes/use cases to extend: `/api/v1/rfqs`, `/api/v1/rfqs/:id/send`, `/api/v1/rfqs/:id/convert`, and `/api/v1/cpq/transitions`.
- Existing RFQ tables/models to reuse: Prisma `RFQ` and `RFQStatus` with `DRAFT`, `SENT`, `RESPONDED`, `REVIEWING`, `CONVERTED`, and `CANCELLED`.
- Existing RFQ events/contracts to reuse: `rfq.created`, `rfq.converted_to_quote`, `quote.created_from_rfq`, and the existing commercial outbox helper.
- Existing transition/ledger functions to reuse: `transitionCpqEntity(...)`, `persistCpqTransition(...)`, and `CpqTransitionLedger`.
- Existing projection/read model behavior to reuse: CRM finance timeline projection and realtime quote/commercial fan-out.
- New additions absolutely required: RFQ lifecycle transition methods in the existing commercial use case, route aliases under the existing RFQ route group, CPQ transition endpoint action support, and canonical RFQ timeline event handling.
- Why they do not conflict: all write behavior remains inside finance-service authority and the existing ledger/outbox path; no new service, table, event stream, or UI surface was introduced.
- Conflict risks: existing web dev-preview RFQ conversion still emits old `rfq.converted` inside local preview-only code; production finance-service emits canonical `rfq.converted_to_quote`.

### RFQ Status / Action Map

| Action | From | To | Canonical Event |
|---|---|---|---|
| `rfq.SUBMIT_FOR_REVIEW` | `DRAFT` | `SENT` | `rfq.submitted_for_review` |
| `rfq.START_REVIEW` | `SENT` | `REVIEWING` | `rfq.review_started` |
| `rfq.RETURN_FOR_CHANGES` | `SENT`, `REVIEWING` | `DRAFT` | `rfq.returned` |
| `rfq.MARK_READY_FOR_QUOTE` | `REVIEWING` | `RESPONDED` | `rfq.ready_for_quote` |
| `rfq.RECORD_RESPONSE` | `SENT`, `REVIEWING` | `RESPONDED` | `rfq.responded` |
| `rfq.CANCEL` | active non-final statuses | `CANCELLED` | `rfq.cancelled` |
| `rfq.CONVERT_TO_QUOTE` | `REVIEWING`, `RESPONDED`, compatibility `READY_FOR_QUOTE` | `CONVERTED` | `rfq.converted_to_quote`, `quote.created_from_rfq` |

`RESPONDED` is the existing schema-compatible ready-for-quote state; no new enum value was introduced.

### Route Wiring Changes

- `/api/v1/rfqs/:id/send` now calls `sendRfq(...)`, which is a compatibility alias for ledger-backed `SUBMIT_FOR_REVIEW`.
- `/api/v1/rfqs/:id/review`, `/return`, `/respond`, `/ready`, and `/cancel` were added inside the existing RFQ route group and delegate to the commercial use case.
- `/api/v1/rfqs/:id/convert` now passes idempotency/correlation metadata into the existing ledger-backed conversion.
- `/api/v1/cpq/transitions` now accepts RFQ lifecycle actions and delegates to the same commercial use-case methods.

### Canonical RFQ Events

Finance-service now emits one canonical event per RFQ transition through `emitCommercialEvent(...)`:

- `rfq.submitted_for_review`
- `rfq.review_started`
- `rfq.returned`
- `rfq.ready_for_quote`
- `rfq.responded`
- `rfq.cancelled`
- `rfq.converted_to_quote`

The realtime consumer now listens to these canonical RFQ events while keeping `rfq.sent` / `rfq.converted` as compatibility aliases.

### Projection / Timeline Compatibility

CRM finance timeline projection now recognizes canonical RFQ lifecycle events and stores the same source metadata, including `sourceEventId`, `sourceEventType`, `aggregateId`, `aggregateType`, and `transitionLedgerId`. No timeline schema changes were made.

### Workflow Verification Table

| Workflow | Entry Point | Owner | Transition/Event | Projection | Audit/Outbox | Tests | Status |
|---|---|---|---|---|---|---|---|
| RFQ create | `POST /api/v1/rfqs` | finance-service | `rfq.created` | CRM timeline eligible | outbox | existing finance tests | `WIRED_AND_TESTED` |
| RFQ submit/send for review | `/rfqs/:id/send` or `cpq/transitions` | finance-service | `SUBMIT_FOR_REVIEW`, `rfq.submitted_for_review` | CRM timeline + realtime | ledger + outbox | use-case and route tests | `WIRED_AND_TESTED` |
| RFQ start review | `/rfqs/:id/review` or `cpq/transitions` | finance-service | `START_REVIEW`, `rfq.review_started` | CRM timeline + realtime | ledger + outbox | use-case tests | `WIRED_AND_TESTED` |
| RFQ return for changes | `/rfqs/:id/return` or `cpq/transitions` | finance-service | `RETURN_FOR_CHANGES`, `rfq.returned` | CRM timeline + realtime | ledger + outbox | use-case tests | `WIRED_AND_TESTED` |
| RFQ mark ready for quote | `/rfqs/:id/ready` or `cpq/transitions` | finance-service | `MARK_READY_FOR_QUOTE`, `rfq.ready_for_quote` | CRM timeline + realtime | ledger + outbox | use-case and CRM tests | `WIRED_AND_TESTED` |
| RFQ cancel | `/rfqs/:id/cancel` or `cpq/transitions` | finance-service | `CANCEL`, `rfq.cancelled` | CRM timeline + realtime | ledger + outbox | use-case tests | `WIRED_AND_TESTED` |
| RFQ convert to quote | `/rfqs/:id/convert` or `cpq/transitions` | finance-service | `CONVERT_TO_QUOTE`, `rfq.converted_to_quote`, `quote.created_from_rfq` | QuoteProjection/CRM timeline eligible | ledger + outbox | existing conversion tests | `WIRED_AND_TESTED` |
| CRM timeline RFQ projection | Kafka `quotes` topic | crm-service | canonical RFQ events | `Activity` timeline | projection metadata | CRM timeline test | `WIRED_AND_TESTED` |

### Tests Added/Updated

- `services/finance-service/src/use-cases/__tests__/commercial-records.use-case.test.ts`
  - RFQ submit, review, return, ready, cancel, and conversion guard behavior.
- `services/finance-service/src/routes/cpq-transitions.routes.test.ts`
  - RFQ submit through the generic CPQ transition endpoint.
- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - canonical `rfq.ready_for_quote` timeline projection with `transitionLedgerId`.

### Cleanup Report

- Duplicate logic introduced: none.
- Dead code removed: none.
- Routes consolidated: new RFQ lifecycle handlers live in the existing RFQ route group and generic CPQ transition route.
- Events consolidated: RFQ lifecycle events are canonicalized under `rfq.*`; legacy realtime aliases remain consumers only.
- Models consolidated: no schema changes.
- Risky legacy code intentionally retained: web dev-preview RFQ conversion remains local/dev-only and still uses compatibility event naming.

### Remaining Risks

- RFQ reviewer permission depth is still limited to existing quote update/send permissions; a dedicated reviewer role/policy can be added later through existing RBAC.
- `RETURN_FOR_CHANGES` maps to existing `DRAFT` because there is no `RETURNED` RFQ enum value.
- CRM finance timeline idempotency remains application-level JSON lookup and is intentionally deferred.

### Next Recommended Slice

Add DB-level idempotency for CRM finance timeline projection, using the existing Activity/timeline owner and without creating a parallel timeline system.

## CRM Finance Timeline DB-Level Idempotency Hardening

### Reuse Map

- Existing CRM timeline owner: `services/crm-service` owns customer timeline projection through the existing `Activity` model.
- Existing Activity model/table: Prisma `Activity` with tenant-scoped indexes and JSON `customFields`.
- Existing Activity metadata/customFields usage: finance projection already stores `timelineSource`, `sourceEventId`, `sourceEventType`, aggregate metadata, `transitionLedgerId`, and correlation metadata in `customFields`.
- Existing finance timeline consumer: `services/crm-service/src/consumers/finance-timeline.consumer.ts`.
- Existing timeline read routes/APIs: account/contact/deal timeline reads already use `Activity` and remain unchanged.
- Existing idempotency behavior: application-level `Activity.findFirst` lookup by `customFields.sourceEventId`.
- Existing migrations/index conventions: CRM service uses additive Prisma migrations; raw SQL is already used where Prisma schema cannot express the contract.
- New additions absolutely required: a tenant-scoped PostgreSQL partial unique expression index for finance projection source IDs, a projector metadata marker, and duplicate unique-violation handling.
- Why they do not conflict: the existing `Activity` table remains the timeline store; no projection table, service, route, event stream, or UI was added.
- Conflict risks: historical finance timeline duplicates are possible, so the unique index is scoped to new hardened projector rows marked with `projectionIdempotencyVersion = 1`.

### Selected Idempotency Design

Selected: Option C, a PostgreSQL partial unique expression index on `Activity.customFields`.

The index is:

- tenant-scoped by `tenantId`;
- scoped to finance timeline rows only;
- scoped to rows with `projectionIdempotencyVersion = 1`;
- unique on `customFields->>'sourceEventId'`.

Rejected alternatives:

- Option A was not available because `Activity` has no native `sourceEventId`/`sourceType` fields.
- Option B would add dedicated finance fields to Activity, but that is broader than needed and would require more Prisma/client surface for data already modeled in `customFields`.
- Option D would introduce an `ActivityProjectionEvent` ledger. That would be a second persistence path for timeline idempotency and was avoided.

### Schema / Migration Changes

Added migration:

- `services/crm-service/prisma/migrations/20260520143000_finance_timeline_activity_idempotency/migration.sql`

It creates:

- `Activity_finance_source_event_unique`

The migration is additive and does not delete or rewrite existing Activity rows. Existing rows without `projectionIdempotencyVersion = 1` remain valid and are still protected by the existing application-level lookup. A future backfill can mark deduplicated historical rows if operators want DB enforcement over historical finance timeline data too.

### Consumer / Replay Behavior

- `projectFinanceTimelineEvent(...)` still performs the application-level duplicate lookup first.
- New finance timeline Activity rows include `projectionIdempotencyVersion: 1`.
- If a concurrent insert hits the DB unique constraint (`P2002`), the projector returns `duplicate` instead of failing the consumer.
- Finance timeline projection now requires a stable source event identity from event metadata/envelope and skips events without one as `missing_source_event_id`.
- Replay execution uses the same projector and now counts DB-level duplicate races as duplicates, not failures.

### Health Compatibility

Finance timeline health still reads existing finance Activity rows via `customFields.timelineSource = finance`; the response shape is unchanged.

### Workflow Verification Table

| Workflow | Entry Point | Owner | DB Idempotency Mechanism | Projection Behavior | Duplicate Behavior | Tests | Status |
|---|---|---|---|---|---|---|---|
| Normal finance event | Kafka finance quote topic | crm-service | unique index on new finance Activity sourceEventId | creates one `Activity` | N/A | consumer tests | `WIRED_AND_TESTED` |
| Duplicate finance event | same consumer | crm-service | app lookup + DB unique catch | no second Activity | returns `duplicate` | consumer tests | `WIRED_AND_TESTED` |
| Replay duplicate event | internal replay report/execution | crm-service | same projector and unique catch | writes only missing Activity rows | counts duplicate | replay tests | `WIRED_AND_TESTED` |
| Timeline health | `/api/v1/internal/finance-timeline/health` | crm-service | unchanged read path | reads finance Activity rows | N/A | internal route tests | `WIRED_AND_TESTED` |
| Account/contact/deal timeline reads | existing CRM timeline APIs | crm-service | Activity remains source | unchanged | N/A | existing coverage | `WIRED_BUT_TEST_GAP` |

### Tests Added/Updated

- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - DB unique violation returns duplicate.
  - missing source event identity is skipped deterministically.
  - replay execution counts DB-level duplicate protection as duplicate.
  - existing `quote.signed`, `rfq.ready_for_quote`, and `drq.approved` projection coverage remains.
- `services/crm-service/src/routes/internal.routes.test.ts`
  - replay/health compatibility remains green.

### Cleanup Report

- Duplicate logic introduced: none.
- Dead code removed: none.
- Routes consolidated: no route changes.
- Events consolidated: no event-name changes.
- Models consolidated: no Prisma model fields or new timeline tables added.
- Risky legacy code intentionally retained: application-level JSON duplicate lookup remains as a first-line guard and for historical rows not covered by the versioned unique index.

### Remaining Risks

- Historical finance Activity duplicates are not automatically rewritten by this migration. This avoids destructive data changes; a later operator-approved backfill can dedupe and mark historical rows with `projectionIdempotencyVersion = 1`.
- Prisma schema does not represent the expression index; it lives in raw SQL migration only.
- Account/contact/deal timeline read tests were not modified because their read path is unchanged.

### Next Recommended Slice

Add a safe, operator-approved historical finance timeline dedupe/backfill report that can identify duplicate `sourceEventId` rows before any optional backfill marks them for DB-level enforcement.

## CRM Finance Timeline Historical Duplicate Report and Backfill Readiness

### Reuse Map

- Existing CRM timeline owner: `services/crm-service` remains the Activity timeline owner.
- Existing Activity model/table: Prisma `Activity`, including tenant/account/contact/deal anchors and JSON `customFields`.
- Existing finance timeline consumer/helper: `services/crm-service/src/consumers/finance-timeline.consumer.ts`.
- Existing internal CRM route pattern: service-token protected `/api/v1/internal/finance-timeline/*` routes in `internal.routes.ts`.
- Existing Activity customFields metadata: `timelineSource`, `sourceEventId`, `sourceEventType`, `aggregateId`, `aggregateType`, `transitionLedgerId`, and `projectionIdempotencyVersion`.
- Existing migration/index conventions: DB-level idempotency is already enforced through a raw SQL partial unique expression index.
- Existing audit/internal operation reporting pattern: replay operations publish audit events; this read-only readiness report does not currently publish audit to avoid expanding audit semantics for non-mutating inspection.
- New additions absolutely required: a read-only readiness analyzer and one internal GET route under the existing finance timeline route family.
- Why they do not conflict: no Activity rows are updated/deleted, no finance aggregates are touched, and no new table/service/UI/event stream was introduced.
- Conflict risks: large tenants may need pagination beyond the capped first 500 finance timeline rows; this tranche intentionally keeps the report bounded.

### Read-Only Report Behavior

Added:

- `analyzeFinanceTimelineIdempotencyReadiness(...)`
- `GET /api/v1/internal/finance-timeline/idempotency-readiness`

The route is service-token protected and returns only sanitized Activity metadata. It accepts:

- `tenantId`
- `fromCreatedAt`
- `toCreatedAt`
- `sourceEventType`
- `limit`, capped at 500
- `includeSamples`

The response is read-only and includes counts, optional sanitized samples, warnings, and a future backfill recommendation.

### Classification Rules

The analyzer inspects existing `Activity` rows where `customFields.timelineSource = finance` and classifies:

- `hardenedRows`: rows already marked `projectionIdempotencyVersion = 1`.
- `eligibleUniqueHistoricalRows`: one row for a tenant/source event id and not yet hardened.
- `duplicateSourceEventGroups`: more than one row with the same `tenantId + sourceEventId`.
- `ambiguousDuplicateGroups`: duplicate groups whose important metadata differs, including event type, aggregate, CRM anchors, or occurred time.
- `missingSourceEventIdRows`: finance timeline rows without a stable source event id.

Non-finance Activity rows are ignored by the query.

### Future Backfill Recommendation Logic

- `canBackfillAutomatically = true` only when eligible unique historical rows exist and there are no duplicate, ambiguous, or missing-source issues.
- duplicate or ambiguous groups return `recommendedNextAction = review_duplicates`.
- missing source IDs return `recommendedNextAction = fix_missing_source_ids`.
- clean eligible rows return `recommendedNextAction = prepare_backfill_plan`.
- empty or already-hardened-only reports return `recommendedNextAction = none`.

No backfill mutation was added.

### Audit Decision

No audit event was added for this read-only readiness report. Replay remains audited because it can execute writes to Activity; this route only inspects Activity metadata and returns a bounded sanitized report. If operators later require audit for read-only internal inspection, it should reuse the existing `internal.operation.audited` contract.

### Workflow Verification Table

| Workflow | Entry Point | Owner | Read-Only Mechanism | Data Inspected | Mutation Behavior | Tests | Status |
|---|---|---|---|---|---|---|---|
| Internal readiness report | `GET /api/v1/internal/finance-timeline/idempotency-readiness` | crm-service | `Activity.findMany` only | finance Activity metadata | none | internal route tests | `WIRED_AND_TESTED` |
| Duplicate detection | readiness analyzer | crm-service | in-memory group by `tenantId + sourceEventId` | sanitized Activity rows | none | consumer tests | `WIRED_AND_TESTED` |
| Eligible historical classification | readiness analyzer | crm-service | single-row historical groups | source event metadata | none | consumer tests | `WIRED_AND_TESTED` |
| Ambiguous duplicate classification | readiness analyzer | crm-service | metadata signature comparison | event/aggregate/CRM anchors | none | consumer tests | `WIRED_AND_TESTED` |
| Future backfill recommendation | readiness analyzer | crm-service | count-based decision | report counts only | none | consumer tests | `WIRED_AND_TESTED` |
| Existing projection | Kafka finance events | crm-service | unchanged projector | finance event payload | Activity create only | existing projection tests | `WIRED_AND_TESTED` |

### Tests Added/Updated

- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - empty readiness report.
  - hardened/eligible/duplicate/ambiguous/missing-source classification.
  - automatic backfill readiness recommendation for clean unique historical rows.
- `services/crm-service/src/routes/internal.routes.test.ts`
  - unauthorized access rejected.
  - sanitized read-only report returned.
  - samples omitted by default.
  - limit capped at 500.

### Cleanup Report

- Duplicate logic introduced: none.
- Dead code removed: none.
- Routes consolidated: route added under the existing finance timeline internal route family.
- Events consolidated: no event changes.
- Models consolidated: no model or schema changes.
- Risky legacy code intentionally retained: historical Activity rows are inspected but not modified.

### Remaining Risks

- The report is bounded to 500 rows. Large tenant-wide cleanup will need cursor-based pagination before operator backfill.
- No durable audit is emitted for this read-only inspection route.
- This tranche does not implement the actual backfill mutation; it only reports readiness.

### Next Recommended Slice

Add cursor-based pagination to the readiness report, then design a dry-run-only historical backfill plan that requires explicit operator approval before any Activity metadata mutation.

## CRM Finance Timeline Idempotency Pagination and Dry-Run Backfill Planning

### Reuse Map

- Existing CRM timeline owner: `services/crm-service` remains the owner of customer timeline projection through `Activity`.
- Existing Activity model/table: reused unchanged; no schema, table, or index changes were added in this tranche.
- Existing readiness utility: extended `analyzeFinanceTimelineIdempotencyReadiness(...)` in `services/crm-service/src/consumers/finance-timeline.consumer.ts`.
- Existing internal route: extended the service-token protected `/api/v1/internal/finance-timeline/idempotency-readiness` route family.
- Existing Activity customFields metadata: reused `timelineSource`, `sourceEventId`, `sourceEventType`, `aggregateId`, `aggregateType`, and `projectionIdempotencyVersion`.
- Existing pagination/cursor conventions: no shared robust cursor helper existed in crm-service, so the readiness utility added a small opaque cursor for this bounded internal report.
- Existing audit/internal operation reporting: reused `publishInternalOperationAuditWithPolicy(...)` for the new dry-run planning operation.
- New additions absolutely required: cursor/category response fields and `POST /api/v1/internal/finance-timeline/idempotency-backfill-plan`.
- Why they do not conflict: both paths are read-only against `Activity`; no Activity update/delete/backfill execution was added, no new timeline table or projection ledger was created, and no finance aggregate can be mutated.
- Conflict risks: duplicate/ambiguous grouping still operates over the bounded finance Activity scan. Large tenants should use tenant/date/event filters until a future SQL-backed group cursor is designed.

### Pagination Behavior

`GET /api/v1/internal/finance-timeline/idempotency-readiness` now supports:

- `category`: `hardened`, `eligible`, `duplicates`, `ambiguous`, `missingSourceEventId`, or `all`.
- `cursor`: opaque encoded offset for the selected category.
- `limit`: page size capped at 500.
- `includeSamples`: keeps legacy optional sample behavior.

The response now includes `category`, `limit`, `cursor`, `nextCursor`, `hasMore`, and sanitized `items`. The underlying scan remains capped at 500 finance Activity rows and is read-only.

### Duplicate Group Pagination Behavior

Duplicate and ambiguous entries are returned as group-level items. Grouping is tenant-scoped by `tenantId + sourceEventId`, so the same finance `sourceEventId` in different tenants is not treated as a duplicate. Ambiguous groups are duplicate groups whose important metadata differs across event type, aggregate, CRM anchors, or occurred time.

### Dry-Run Backfill Plan Behavior

Added `POST /api/v1/internal/finance-timeline/idempotency-backfill-plan`.

The endpoint:

- requires internal service token access.
- requires `operatorReason`.
- always returns `dryRun: true` and `executed: false`.
- never updates `Activity`, never deletes duplicates, never marks `projectionIdempotencyVersion = 1`, never emits timeline events, and never mutates finance aggregates.
- returns counts for `wouldMarkVersion1`, duplicate/ambiguous blockers, missing source id blockers, already hardened rows, and unsafe rows.

### Approval Gates

The plan always declares:

- `requiresOperatorApproval = true`
- `requiresBackfillMutationEndpoint = true`

It sets duplicate and missing-source gates based on detected blockers. Recommendations are:

- `blocked_by_duplicates`
- `blocked_by_missing_source_ids`
- `ready_for_operator_review`
- `no_action_needed`

### Audit Decision

The read-only GET readiness report remains unaudited. The dry-run backfill plan is audited because it prepares a future operator-approved mutation path. The audit event uses the existing internal operation audit contract with operation type `financeTimeline.idempotency_backfill_plan` and stores only sanitized filters/counts/reason, not raw Activity customFields or finance/customer payloads.

### Workflow Verification Table

| Workflow | Entry Point | Owner | Read-Only Mechanism | Data Inspected | Mutation Behavior | Pagination Behavior | Tests | Status |
|---|---|---|---|---|---|---|---|---|
| Paginated readiness report | `GET /api/v1/internal/finance-timeline/idempotency-readiness` | crm-service | `Activity.findMany` + sanitized in-memory classification | finance Activity metadata | none | opaque cursor per selected category | route + consumer tests | `WIRED_AND_TESTED` |
| Duplicate group pagination | same route with `category=duplicates` | crm-service | tenant-scoped group by `tenantId + sourceEventId` | source event ids and sanitized metadata | none | group-level items | consumer tests | `WIRED_AND_TESTED` |
| Missing source ID pagination | same route with `category=missingSourceEventId` | crm-service | sanitized row classification | finance Activity rows missing source id | none | row-level items | consumer tests | `WIRED_AND_TESTED` |
| Dry-run backfill plan | `POST /api/v1/internal/finance-timeline/idempotency-backfill-plan` | crm-service | readiness analyzer reused | bounded finance Activity scan | none | accepts same cursor/limit filters | route + consumer tests | `WIRED_AND_TESTED` |
| Backfill plan audit | same POST route | crm-service + `@nexus/audit` | internal operation audit event | counts/filters/reason only | audit publish only | N/A | route test | `WIRED_AND_TESTED` |
| Existing projection | Kafka finance events | crm-service | unchanged projector | finance event payload | Activity create only | N/A | existing projection tests | `WIRED_AND_TESTED` |

### Tests Added/Updated

- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - cursor pagination for eligible readiness items.
  - tenant-scoped duplicate grouping.
  - dry-run backfill plan counts, blockers, approval gates, and no mutations.
- `services/crm-service/src/routes/internal.routes.test.ts`
  - invalid cursor rejected.
  - backfill plan requires `operatorReason`.
  - backfill plan returns sanitized dry-run report and publishes sanitized audit.

### Cleanup Report

- Duplicate logic introduced: none; readiness and planning share the existing analyzer.
- Dead code removed: none.
- Routes consolidated: new plan route added under the existing `/internal/finance-timeline` family.
- Events consolidated: no finance or timeline event changes.
- Models consolidated: no schema/table/model additions.
- Risky legacy code intentionally retained: bounded in-memory grouping remains until a future SQL-backed group cursor/backfill executor is explicitly designed.
- Remaining technical debt: exact global duplicate counts for tenants above the 500-row scan cap require a future query plan.
- Architectural risks still present: no real backfill execution exists yet by design; a future executor must require explicit approval and preserve audit strictness.

### Remaining Risks

- The report paginates within the bounded scan. Large tenants should use date/event filters; a future SQL grouping strategy is needed for complete global duplicate pagination.
- The backfill plan is audited, but no durable mutation approval workflow exists yet.
- Historical rows remain unchanged until a future approved backfill mutation route is implemented.

### Next Recommended Slice

Design the operator-approved, dry-run-first historical Activity metadata backfill executor that can mark eligible unique historical rows with `projectionIdempotencyVersion = 1`, while blocking duplicate, ambiguous, and missing-source groups by policy.

## Operator-Approved Historical Activity Metadata Backfill Executor

### Reuse Map

- Existing CRM timeline owner: `services/crm-service` remains the Activity timeline owner.
- Existing Activity model/table: reused `Activity` and its JSON `customFields`; no table, ledger, or schema migration was added.
- Existing readiness utility: reused `analyzeFinanceTimelineIdempotencyReadiness(...)`.
- Existing dry-run backfill plan route: reused `POST /api/v1/internal/finance-timeline/idempotency-backfill-plan`.
- Existing internal route family: extended `/api/v1/internal/finance-timeline/*`.
- Existing Activity customFields metadata: preserved `timelineSource`, `sourceEventId`, `sourceEventType`, aggregate fields, `transitionLedgerId`, and `correlationId`.
- Existing audit/internal operation publisher: reused `publishInternalOperationAuditWithPolicy(...)`.
- Existing audit strictness policy: reused the same policy path as replay/backfill plan audit publishing.
- Existing pagination/cursor conventions: reused the previous readiness/report plan shape; execution requires explicit `activityIds`.
- New additions absolutely required: deterministic stateless `planHash`, bounded execution helper, and one internal execute route.
- Why they do not conflict: execution updates only selected, validated, eligible historical Activity metadata rows; it never deletes, merges, republishes events, or mutates finance aggregates.
- Conflict risks: strict audit failure is evaluated after execution using the existing audit helper; if strict audit fails after metadata writes, the route returns failure with the mutation already applied. A future two-phase audit-intent/result contract would close that consistency gap.

### Execution Contract

Added:

- `executeFinanceTimelineIdempotencyBackfill(...)`
- `POST /api/v1/internal/finance-timeline/idempotency-backfill-execute`

The route requires:

- service token.
- `tenantId` or `x-tenant-id`.
- `operatorReason`.
- `approvalReason`.
- `planHash`.
- non-empty `activityIds`, capped at 500.
- `execute: true`.
- confirmation phrase `BACKFILL_FINANCE_TIMELINE_IDEMPOTENCY`.

The operation is bounded by explicit Activity IDs and does not support cursor-wide or tenant-wide mutation.

### PlanHash / Dry-Run-First Strategy

The dry-run plan now returns a deterministic `planHash`. The hash is stateless and based on:

- plan version.
- tenant id.
- date/event filters.
- eligible Activity IDs and source event IDs.
- duplicate, ambiguous, and missing source ID blocker counts.

Execution recomputes the current plan and rejects stale/mismatched hashes before metadata updates. There is no durable plan store in this tranche.

### Eligibility Validation

Each requested row is re-read and validated before mutation:

- row exists.
- tenant matches.
- `customFields.timelineSource = finance`.
- stable `sourceEventId` exists.
- `projectionIdempotencyVersion` is not already `1`.
- `sourceEventId` is unique in the tenant’s finance timeline Activity rows.
- duplicate and ambiguous source-event groups are blocked.
- selected row is present in the current eligible plan.

Already hardened rows are treated as no-op blockers. Missing source ID, non-finance, tenant mismatch, duplicate, ambiguous, and unsafe rows are not updated.

### Mutation Behavior

Eligible rows are updated individually with a metadata merge:

- `projectionIdempotencyVersion = 1`
- `idempotencyBackfilledAt`
- `idempotencyBackfillOperationId`
- `idempotencyBackfillReason`

Existing source and finance metadata is preserved. No `updateMany`, no delete, no duplicate merge, no finance mutation, and no event publishing were added. Prisma `P2002` unique conflicts are handled as duplicate blockers.

### Audit Behavior

Execution publishes sanitized `internal.operation.audited` metadata with operation type:

- `financeTimeline.idempotency_backfill_execute`

Audit contains operation ID, operator, reason, dry-run operation ID, plan hash, requested count, result counts, status, warnings/errors, and timestamps. It does not store raw Activity `customFields`, finance payloads, or customer data.

Consistency note: the existing audit helper is invoked after execution, matching current internal operation patterns. If strict audit publishing fails after Activity metadata updates, the route reports `AUDIT_REQUIRED_FAILED`; the metadata mutation is not rolled back in this tranche.

### Workflow Verification Table

| Workflow | Entry Point | Owner | Mutation Behavior | Data Inspected | Validation/Approval Gates | Audit Behavior | Tests | Status |
|---|---|---|---|---|---|---|---|---|
| Dry-run backfill plan | `POST /api/v1/internal/finance-timeline/idempotency-backfill-plan` | crm-service | none | bounded finance Activity scan | reason required | audited as plan | route + consumer tests | `WIRED_AND_TESTED` |
| Backfill execution valid hash | `POST /api/v1/internal/finance-timeline/idempotency-backfill-execute` | crm-service | per-row metadata merge only | requested Activity rows + finance source groups | service token, reason, approval, planHash, confirmation, explicit IDs | audited as execute | route + consumer tests | `WIRED_AND_TESTED` |
| Duplicate blocker | execution helper | crm-service | no update | tenant finance source-event groups | duplicate sourceEventId blocks | included in counts | consumer tests | `WIRED_AND_TESTED` |
| Ambiguous blocker | execution helper | crm-service | no update | metadata signature across duplicate group | metadata difference blocks | included in counts | consumer tests | `WIRED_AND_TESTED` |
| Missing sourceEventId blocker | execution helper | crm-service | no update | Activity customFields | missing source id blocks | included in counts | consumer tests | `WIRED_AND_TESTED` |
| Already hardened no-op | execution helper | crm-service | no update | Activity customFields | projection version 1 is no-op | included in counts | consumer tests | `WIRED_AND_TESTED` |
| Audit event publishing | execute route | crm-service + `@nexus/audit` | audit publish only | sanitized counts/filters | service token route | operation audit emitted | route tests | `WIRED_AND_TESTED` |
| Existing projection | Kafka finance events | crm-service | unchanged Activity create path | finance event payload | existing sourceEventId guard | unchanged | existing projection tests | `WIRED_AND_TESTED` |

### Tests Added/Updated

- `services/crm-service/src/consumers/finance-timeline.consumer.test.ts`
  - plan returns deterministic `planHash`.
  - approved execution updates only eligible unique historical rows.
  - stale plan hash blocks execution.
  - duplicate, missing source ID, non-finance, tenant mismatch, and already hardened rows are blocked/no-op.
  - unique constraint conflicts are counted as duplicate blockers.
- `services/crm-service/src/routes/internal.routes.test.ts`
  - execute route rejects missing approval gates.
  - execute route updates eligible row metadata and emits sanitized audit.

### Cleanup Report

- Duplicate logic introduced: none; execution reuses the readiness/backfill plan analyzer.
- Dead code removed: none.
- Routes consolidated: one route added under the existing internal finance timeline route family.
- Events consolidated: no event-name changes and no event publishing added.
- Models consolidated: no new table, projection ledger, or Prisma model.
- Risky legacy code intentionally retained: historical duplicate and ambiguous rows remain untouched.
- Remaining technical debt: audit is post-execution with the existing helper; strict pre-mutation audit intent would need an explicit two-phase audit contract.
- Architectural risks still present: execution is bounded to the current analyzer scan; future large-tenant execution should add SQL-backed candidate selection before broader backfills.

### Remaining Risks

- The executor is intentionally ID-list based; operators must use readiness/backfill plan output to select eligible rows.
- Plan hash is stateless and current-data based, not backed by a durable plan record.
- No automatic duplicate resolution exists, by design.

### Next Recommended Slice

Add an internal read-only execution history/reporting view for `financeTimeline.idempotency_backfill_execute` audit records so operators can review completed and blocked backfill attempts without touching Activity rows.

## Operator Audit History for Finance Timeline Backfill Execution

### Reuse Map

- Existing audit owner service: `services/audit-consumer`.
- Existing audit table/model: audit-consumer Prisma `AuditLog`, resource `internal_operation`.
- Existing internal operation audit route: `GET /api/v1/internal/audit/internal-operations`.
- Existing `@nexus/audit` contract: `internal.operation.audited`, with operation metadata, counts, filters, status, warnings, and errors.
- Existing operation types supported: `cpq.transition.reconcile`, `quoteProjection.replay`, and `financeTimeline.replay`.
- Existing filters supported: tenant, operation type, operation ID, operator, source service, target domain/projection, dry-run, executed, status, correlation ID, date range, limit, cursor.
- Existing service-token/admin pattern: audit-consumer internal service token; web admin audit BFF keeps the service token server-side.
- Existing sanitized response behavior: returns summaries only and strips payload/object-shaped sensitive values.
- New additions absolutely required: add `financeTimeline.idempotency_backfill_execute` to existing allowlists and preserve safe scalar count fields such as `blockedMissingSourceEventId`.
- Why they do not conflict: no new audit route, table, service, or UI page was created.
- Conflict risks: the sanitizer now allows scalar keys containing `event` so safe counts can be returned; object/array payload-like fields are still excluded.

### Audit Owner / Read Path Reused

Backfill execution history is exposed through the existing audit-consumer route:

- `GET /api/v1/internal/audit/internal-operations`

The existing admin audit BFF route also supports the operation type:

- `GET /api/admin/audit/internal-operations`

No CRM-side audit read route was added.

### Operation Type Supported

Added support for:

- `financeTimeline.idempotency_backfill_execute`

Operators can query completed, completed-with-warnings, blocked, and failed execution attempts through the generic `status` filter.

### Filters Supported

The existing route supports:

- `tenantId`
- `operationType`
- `operationId`
- `operatorId`
- `sourceService`
- `targetDomain` / `targetProjection`
- `dryRun`
- `executed`
- `status`
- `correlationId`
- `from`
- `to`
- `limit`
- `cursor`

The web admin audit BFF forwards the same generic filters and caps `limit` at 500.

### Sanitized Response Behavior

The response includes sanitized summaries:

- audit ID, tenant, operation type, operation ID, operator, source service, target projection/domain.
- dry-run/executed flags.
- reason summary.
- filters summary.
- counts, including backfill execution counts such as `requested`, `validatedEligible`, `updated`, `alreadyHardened`, `blockedDuplicate`, `blockedAmbiguous`, `blockedMissingSourceEventId`, `blockedUnsafe`, and `failed`.
- status, warning/error summaries, correlation ID, created/completed timestamps.

It does not return raw Activity `customFields`, finance/source event payloads, or customer payloads.

### Access Control

- Audit-consumer route requires the internal service token.
- Tenant scope is required.
- Limit is capped at 500.
- Cursor pagination is unchanged.
- The route is read-only and only calls `AuditLog.findMany`.

### Optional BFF/Admin Audit Check

The existing admin audit page and BFF are reused. The BFF allowlist now accepts `financeTimeline.idempotency_backfill_execute`; the admin page operation type and status dropdowns include the new operation and `blocked` status. No new UI page was added.

### Workflow Verification Table

| Workflow | Entry Point | Owner | Data Read | Sanitization Behavior | Mutation Behavior | Tests | Status |
|---|---|---|---|---|---|---|---|
| Backfill execution audit publish | CRM execute route | crm-service + `@nexus/audit` | sanitized operation report | producer omits raw Activity/finance payloads | audit publish only | existing CRM route tests | `WIRED_AND_TESTED` |
| Audit consumer stores AuditLog | audit consumer pipeline | audit-consumer | `internal.operation.audited` events | storage is existing audit table | AuditLog insert only | existing consumer path | `WIRED_BUT_TEST_GAP` |
| Internal audit read by operation type | `/api/v1/internal/audit/internal-operations` | audit-consumer | AuditLog rows | sanitized records only | none | audit-consumer route tests | `WIRED_AND_TESTED` |
| Filter by tenant/correlation/status | same route | audit-consumer | AuditLog where filters | unchanged sanitizer | none | audit-consumer route tests | `WIRED_AND_TESTED` |
| Admin audit BFF proxy | `/api/admin/audit/internal-operations` | web BFF | audit-consumer response | second sanitizer, service token hidden | none | web route tests | `WIRED_AND_TESTED` |
| Existing audit reads | same generic route | audit-consumer/web | replay/reconciliation records | unchanged | none | existing tests | `WIRED_AND_TESTED` |

### Tests Added/Updated

- `services/audit-consumer/src/internal-operation-audit.routes.test.ts`
  - queries `financeTimeline.idempotency_backfill_execute`.
  - filters by status and correlation ID.
  - returns sanitized backfill counts including `blockedMissingSourceEventId`.
  - does not expose raw Activity customFields, source events, or payloads.
- `apps/web/src/app/api/admin/audit/internal-operations/route.test.ts`
  - forwards the new operation type through the existing admin audit proxy.
  - keeps the service token server-side.
  - preserves safe counts and redacts sensitive fields.
- `apps/web/src/app/admin/audit/page.tsx`
  - existing page filter list includes the operation type and `blocked` status.

### Cleanup Report

- Duplicate logic introduced: none.
- Dead code removed: none.
- Routes consolidated: reused existing audit-consumer and admin audit BFF routes.
- Events consolidated: no audit event contract changes.
- Models consolidated: no new audit model/table.
- Risky legacy code intentionally retained: generic audit sanitizer remains conservative and omits object/array payload data.
- Remaining technical debt: audit-consumer storage path remains covered by existing consumer behavior rather than a dedicated end-to-end storage test in this tranche.
- Architectural risks still present: none introduced; visibility depends on audit events being successfully published by the CRM backfill executor.

### Remaining Risks

- If audit publish failed during the backfill execution, no history record exists for that attempt beyond the route response/logging behavior.
- The audit read path reports sanitized summaries only; operators needing row-level blocked details must use the execution response or future approved audit metadata extensions.

### Next Recommended Slice

Add a reconciliation/health check that compares CRM backfill execution audit counts with Activity metadata updates, so operators can detect audit/metadata consistency drift without mutating Activity rows.

## Admin Audit Ergonomics for Internal Operations

Improve operator usability for internal operation audit records while keeping audit-consumer as the read owner and the existing admin audit page as the UI surface.

### Reuse Map

- Existing audit owner service: `services/audit-consumer`.
- Existing audit read route: `GET /api/v1/internal/audit/internal-operations`.
- Existing web BFF route: `/api/admin/audit/internal-operations`.
- Existing admin audit UI page/component: `apps/web/src/app/admin/audit/page.tsx`.
- Existing table/filter components: the existing page-local audit table and form controls.
- Existing export/download patterns: existing page-local sanitized CSV download.
- Existing saved-filter/user-preference patterns: no generic saved-view owner was found for audit filters.
- Existing permission model: `requireAdmin` in the BFF plus admin/audit-read checks in the page; service token remains server-side.
- Existing sanitization logic: audit-consumer sanitizer plus web BFF sanitizer, both preserving scalar summaries and dropping payload/object data.
- New additions absolutely required: page-level quick presets, additional filter controls for existing BFF keys, current-result summary cards, and tests.
- Why they do not conflict: no new route family, table, audit contract, persistent saved-filter model, or UI page was added.
- Conflict risks: persistent saved filters were intentionally not added because no reusable saved-view owner was identified.

### Filter Ergonomics Added

The existing admin audit page now exposes additional controls that map to the existing BFF filter contract:

- source service.
- target domain/projection.
- time range.
- quick presets for failed, blocked, warning-producing, backfill, replay, reconciliation, last 24 hours, and last 7 days views.

The BFF remains the validation and forwarding boundary for allowed filters.

### Saved/Reusable Filter Decision

Reusable filters are non-persistent page constants only. No saved-filter table or preference store was introduced. Persistent saved audit views remain future work and should reuse a generic saved-view owner if one is added later.

### Export-Safe Summary Decision

No new export endpoint was added. The existing page CSV action was retained and remains limited to sanitized records already returned by the BFF. It exports only safe summary columns such as operation type, IDs, actor, source service, target, mode, status, reason, counts, warning/error summaries, correlation ID, and timestamps.

### Summary Count Behavior

The page shows current-result-window summaries only:

- total returned operations.
- failed, blocked, and warning-producing records.
- executed and dry-run counts.
- top operation types in the current page of sanitized results.

These are not global audit counts and do not trigger unbounded queries.

### Access Control and Sanitization

- Admin/audit permission checks remain in the existing page and BFF.
- Service token remains server-side.
- Tenant scope, limit cap, and cursor pagination remain unchanged.
- The browser never receives raw audit metadata, Activity `customFields`, finance/source event payloads, customer payloads, service tokens, or internal secrets.

### Workflow Verification Table

| Workflow | Entry Point | Owner | Data Read | Filters Used | Sanitization Behavior | Mutation Behavior | Tests | Status |
|---|---|---|---|---|---|---|---|---|
| Admin filter change | `/admin/audit` | web admin audit page | sanitized BFF records | operation/status/executed/source/target/time/search | renders only sanitized fields | none | page tests | `WIRED_AND_TESTED` |
| BFF filter forwarding | `/api/admin/audit/internal-operations` | web BFF | audit-consumer response | existing allowed query keys | second sanitizer, token hidden | none | existing BFF tests | `WIRED_AND_TESTED` |
| Audit-consumer read | `/api/v1/internal/audit/internal-operations` | audit-consumer | `AuditLog.findMany` | existing route filters | first sanitizer | none | existing route tests | `WIRED_AND_TESTED` |
| Quick presets | `/admin/audit` buttons | web admin audit page | sanitized BFF records | preset query-state values | unchanged | none | page tests | `WIRED_AND_TESTED` |
| Reusable filters | page constants | web admin audit page | none persisted | allowed keys only | no raw rows saved | none | page tests | `WIRED_AND_TESTED` |
| Export-safe summary | `Export CSV` button | web admin audit page | current sanitized records | current page/window | safe columns only | none | page tests | `WIRED_AND_TESTED` |
| Access control/sanitization | admin page + BFF | web + audit-consumer | sanitized audit records | tenant/limit/cursor preserved | raw payloads omitted | none | page/BFF tests | `WIRED_AND_TESTED` |

### Tests Added/Updated

- `apps/web/src/app/admin/audit/page.test.tsx`
  - quick filters produce expected BFF query params.
  - source service, target, and time range filters forward existing BFF keys.
  - current-result summaries are derived from sanitized records.
  - CSV export uses only safe sanitized columns and omits raw custom fields/customer payload data.

### Cleanup Report

- Duplicate logic introduced: none.
- Dead code removed: none.
- Routes consolidated: existing audit-consumer and BFF routes reused.
- Events consolidated: no audit event changes.
- Models consolidated: no new table/model.
- Risky legacy code intentionally retained: existing page-local CSV export remains, but it exports only sanitized BFF records.
- Remaining technical debt: persistent saved views are not available without a generic saved-view owner.
- Architectural risks still present: summary cards are current-page summaries, not full result-set aggregates.

### Remaining Risks

- The quick `Replay operations` preset is constrained by the current single-operationType BFF filter shape; broader multi-operation presets would require an explicit BFF contract change.
- CSV export is browser-side and limited to the current sanitized page, not a server-generated audit export.

### Next Recommended Slice

Add a read-only audit consistency check that compares finance timeline backfill execution audit counts with Activity metadata updates, reusing existing CRM readiness utilities and audit-consumer history rather than adding a new monitoring store.

## Read-Only Backfill Audit vs Activity Consistency Check

Add an internal, read-only consistency report that compares finance timeline backfill execution audit records with the Activity metadata rows written by the approved backfill executor.

### Reuse Map

- Existing CRM Activity owner: `crm-service`, using the existing Activity timeline table.
- Existing Activity metadata fields inspected: `timelineSource`, `projectionIdempotencyVersion`, `sourceEventId`, `sourceEventType`, `idempotencyBackfillOperationId`, and `idempotencyBackfilledAt`.
- Existing backfill execution route: `POST /api/v1/internal/finance-timeline/idempotency-backfill-execute`.
- Existing audit owner service: `audit-consumer`.
- Existing audit read route queried: `GET /api/v1/internal/audit/internal-operations`.
- Existing internal route/security pattern: `crm-service` internal routes under `/api/v1/internal/finance-timeline/*` protected by `x-service-token`.
- Existing service-token/internal client pattern: `INTERNAL_SERVICE_TOKEN`, with configurable `AUDIT_CONSUMER_URL`.
- Existing readiness/backfill analyzer reused: Activity metadata conventions from the finance timeline idempotency readiness/backfill utilities.
- Existing sanitization behavior reused: audit-consumer returns sanitized audit records; CRM returns only sanitized comparison summaries.
- New additions absolutely required: one read-only CRM internal route plus a comparison helper.
- Why they do not conflict: audit-consumer remains audit read owner; CRM only counts its own Activity metadata; no audit/timeline table, UI, event, or mutation path was added.
- Conflict risks: consistency depends on sanitized `counts.updated` being present in audit records; missing counts are classified as inconclusive.

### Consistency Route Behavior

Route:

`GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency`

Supported query params:

- `tenantId`
- `operationId`
- `correlationId`
- `fromCreatedAt`
- `toCreatedAt`
- `status`
- `limit`, capped at 500
- `cursor`
- `includeSamples`

The route:

- requires the internal service token.
- queries audit-consumer through its existing sanitized internal operation read path.
- filters audit reads to `financeTimeline.idempotency_backfill_execute`.
- counts Activity rows by tenant and `customFields.idempotencyBackfillOperationId`.
- returns `nextCursor` from audit-consumer when present.
- does not publish audit for this read-only report.
- does not mutate Activity, AuditLog, finance aggregates, projections, or events.

### Comparison Rules

For each backfill execution audit operation:

- `auditUpdatedCount` comes from sanitized `counts.updated`.
- `activityBackfilledCount` counts Activity rows where:
  - `tenantId` matches.
  - `customFields.timelineSource = finance`.
  - `customFields.projectionIdempotencyVersion = 1`.
  - `customFields.idempotencyBackfillOperationId = operationId`.

Classifications:

- `CONSISTENT`: audit `updated` exists and equals Activity metadata count.
- `COUNT_MISMATCH`: audit `updated` exists and differs from Activity metadata count.
- `ACTIVITY_METADATA_MISSING`: audit `updated > 0` and Activity metadata count is zero.
- `AUDIT_MISSING`: operationId-specific lookup finds Activity metadata but no matching audit record.
- `INCONCLUSIVE`: audit is failed/blocked, audit counts are missing, audit-consumer is unavailable, or no confident comparison can be made.

Failed and blocked audits are not treated as mismatches automatically.

### Orphan Metadata Decision

The first consistency slice supported the safe operationId-specific orphan case: if an operator supplies `operationId` and Activity metadata exists without a matching audit record, the report returns `AUDIT_MISSING`. Bounded Activity-first orphan discovery is added in the later section below using cursor pagination and the same audit-consumer read path.

### Audit-Consumer Client Behavior

- Uses `AUDIT_CONSUMER_URL`, defaulting to `http://localhost:3028`.
- Sends `x-service-token` and `x-tenant-id` server-side only.
- Preserves audit-consumer limit/cursor behavior.
- If audit-consumer is unavailable, the route returns a degraded/inconclusive report with a warning rather than claiming consistency.
- It consumes only the sanitized audit read response.

### Sanitization Policy

Responses include sanitized operation IDs, correlation IDs, statuses, counts, timestamps, and optional sanitized Activity samples. Responses do not include raw Activity `customFields`, raw audit metadata, source event payloads, finance payloads, customer payloads, service tokens, or internal secrets.

### Workflow Verification Table

| Workflow | Entry Point | Owner | Data Read | Comparison Logic | Mutation Behavior | Tests | Status |
|---|---|---|---|---|---|---|---|
| Consistency by operationId | `/api/v1/internal/finance-timeline/idempotency-backfill-consistency?operationId=...` | crm-service route + audit-consumer read | sanitized audit records and Activity counts | `counts.updated` vs Activity metadata count | none | CRM route tests | `WIRED_AND_TESTED` |
| Consistency by date/range filters | same route | crm-service route + audit-consumer read | paginated audit records | per-operation comparison | none | CRM route tests | `WIRED_AND_TESTED` |
| Audit-consumer unavailable | same route | crm-service route | audit call status only | returns inconclusive warning | none | CRM route tests | `WIRED_AND_TESTED` |
| Count mismatch detection | same route | crm-service route | sanitized audit counts and Activity counts | mismatch/missing metadata statuses | none | CRM route tests | `WIRED_AND_TESTED` |
| Orphan operationId check | same route with `operationId` | crm-service route | Activity metadata count | `AUDIT_MISSING` when metadata exists without audit | none | route tests | `WIRED_AND_TESTED` |
| Sanitized samples | same route with `includeSamples=true` | crm-service route | Activity IDs and source IDs only | optional safe samples | none | CRM route tests | `WIRED_AND_TESTED` |
| Existing backfill execution | `POST /idempotency-backfill-execute` | crm-service | existing Activity metadata path | unchanged | approved metadata update only | existing tests | `WIRED_AND_TESTED` |

### Tests Added/Updated

- `services/crm-service/src/routes/internal.routes.test.ts`
  - consistency route rejects public access.
  - matching audit and Activity counts return `CONSISTENT`.
  - count mismatches return `COUNT_MISMATCH`.
  - failed/blocked audit records return `INCONCLUSIVE`, not false mismatches.
  - audit-consumer outage returns an inconclusive warning.
  - service token is used server-side and raw Activity metadata is not returned.

### Cleanup Report

- Duplicate logic introduced: none.
- Dead code removed: none.
- Routes consolidated: reused existing CRM finance-timeline internal route family and audit-consumer read path.
- Events consolidated: no event changes.
- Models consolidated: no new Activity, audit, or projection model/table.
- Risky legacy code intentionally retained: no repair or mutation path was added.
- Remaining technical debt: full tenant-wide orphan inventory remains intentionally avoided; bounded page-scoped orphan reporting is handled in the later slice.
- Architectural risks still present: audit consistency is limited by sanitized audit fields and by availability of audit-consumer.

### Remaining Risks

- If audit records lack `counts.updated`, the report cannot prove consistency and returns `INCONCLUSIVE`.
- If Activity metadata was changed outside the approved executor, this report detects count drift but does not repair it.
- Broad unbounded orphan metadata detection remains intentionally avoided.

### Next Recommended Slice

Add a bounded Activity-first orphan metadata report for finance timeline backfill operation IDs, reusing the same CRM route family and audit-consumer lookup path, with cursor pagination and no mutation.

## Bounded Activity-First Orphan Metadata Reporting

Add a read-only Activity-first orphan report for finance timeline backfill metadata, scoped to the existing CRM finance-timeline internal route family.

### Reuse Map

- Existing CRM Activity owner: `crm-service`, using the existing Activity timeline table.
- Existing Activity metadata fields inspected: `timelineSource`, `projectionIdempotencyVersion`, `sourceEventId`, `idempotencyBackfillOperationId`, and `idempotencyBackfilledAt`.
- Existing consistency route/helper: `GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency` and the finance timeline consumer consistency helpers.
- Existing audit owner service: `audit-consumer`.
- Existing audit read route: `GET /api/v1/internal/audit/internal-operations`.
- Existing internal service-token pattern: `INTERNAL_SERVICE_TOKEN` and `AUDIT_CONSUMER_URL`, server-side only.
- Existing cursor/pagination convention: encoded offset cursor reused from CRM finance timeline readiness reporting.
- Existing sanitization behavior: sanitized audit reads plus CRM Activity samples that expose only IDs/counts/timestamps.
- New additions absolutely required: `mode=orphan-metadata` on the existing consistency route plus a bounded Activity-first helper.
- Why they do not conflict: no new audit route family, table, UI, event, repair workflow, or timeline store was introduced.
- Conflict risks: audit-consumer supports single `operationId` lookup, so the helper performs bounded per-operation lookup only for operation IDs found in the current Activity page.

### Route / Mode Behavior

`GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency?mode=orphan-metadata`

Supported query params:

- `tenantId`
- `operationId`
- `fromBackfilledAt`
- `toBackfilledAt`
- `status`
- `limit`, capped at 500
- `cursor`
- `includeSamples`

The mode is internal/service-token only, tenant scoped, cursor paginated, and read-only. It does not update Activity, AuditLog, finance aggregates, projections, or events.

### Activity-First Scan Rules

The report scans only bounded Activity rows that look like executor-written finance backfill metadata:

- `tenantId` matches.
- `customFields.timelineSource = finance`.
- `customFields.projectionIdempotencyVersion = 1`.
- `customFields.idempotencyBackfillOperationId` exists.
- optional `idempotencyBackfilledAt` date bounds match.

Rows are ordered by Activity `createdAt` and paged with the existing encoded cursor convention. The summary is page-scoped to avoid unbounded tenant scans.

### Audit-Consumer Lookup Behavior

For each unique `idempotencyBackfillOperationId` in the bounded page, CRM queries audit-consumer through the existing sanitized internal operation route with:

- `operationType = financeTimeline.idempotency_backfill_execute`
- `operationId = idempotencyBackfillOperationId`
- matching `tenantId`

If audit-consumer is unavailable or returns malformed/mismatched data, the item is `INCONCLUSIVE`, not falsely classified as missing.

### Classification Rules

- `MATCHED`: matching sanitized audit record exists; counted but not returned in `items`.
- `AUDIT_MISSING`: Activity metadata exists for an operation ID and audit-consumer returns no matching operation record.
- `INCONCLUSIVE`: audit-consumer unavailable, malformed response, missing/invalid operation ID, or lookup cannot verify tenant/operation match.

Failed or blocked audit records are not orphan metadata if the audit exists; they remain consistency concerns for the existing audit-vs-Activity report.

### Pagination Behavior

- `limit` is capped at 500.
- invalid cursor returns a validation error.
- `nextCursor` and `hasMore` are returned when more bounded Activity rows are available.
- Duplicate Activity rows for the same backfill operation ID are grouped within the current page.

### Sanitization Policy

Responses include operation IDs, Activity counts, first/last backfilled timestamps, and optional sample Activity/source event IDs. Responses never include raw Activity `customFields`, raw audit metadata, source event payloads, finance/customer payloads, service tokens, or secrets.

### Workflow Verification Table

| Workflow | Entry Point | Owner | Data Read | Audit Lookup Behavior | Classification Behavior | Mutation Behavior | Tests | Status |
|---|---|---|---|---|---|---|---|---|
| Orphan report by operationId | consistency route with `mode=orphan-metadata&operationId=...` | crm-service | bounded Activity metadata | single sanitized audit lookup | `AUDIT_MISSING` or matched/inconclusive | none | CRM route tests | `WIRED_AND_TESTED` |
| Orphan report by page/date | consistency route with date/cursor filters | crm-service | bounded Activity metadata page | per-operation lookup within page | page-scoped missing/inconclusive groups | none | CRM route tests | `WIRED_AND_TESTED` |
| Matched audit operation | same route | crm-service + audit-consumer | Activity metadata and sanitized audit record | record found | counted as matched, not returned as orphan | none | CRM route tests | `WIRED_AND_TESTED` |
| Missing audit operation | same route | crm-service + audit-consumer | Activity metadata, empty audit result | no record found | `AUDIT_MISSING` | none | CRM route tests | `WIRED_AND_TESTED` |
| Audit-consumer unavailable | same route | crm-service | Activity metadata only | degraded lookup warning | `INCONCLUSIVE` | none | CRM route tests | `WIRED_AND_TESTED` |
| Pagination behavior | same route with cursor/limit | crm-service | bounded Activity page | bounded lookup only | page-scoped results | none | CRM route tests | `WIRED_AND_TESTED` |
| Existing consistency report | same route without orphan mode | crm-service + audit-consumer | unchanged audit-first comparison | unchanged | unchanged | none | existing route tests | `WIRED_AND_TESTED` |

### Tests Added/Updated

- `services/crm-service/src/routes/internal.routes.test.ts`
  - orphan mode reports Activity metadata whose backfill operation has no matching audit record.
  - matching audit records are counted and not returned as orphans.
  - audit-consumer outage returns `INCONCLUSIVE`, not `AUDIT_MISSING`.
  - invalid orphan cursor is rejected.
  - response omits raw Activity `customFields` and does not call Activity mutation methods.

### Cleanup Report

- Duplicate logic introduced: none; the existing consistency route family was extended with a mode.
- Dead code removed: none.
- Routes consolidated: no new route family; audit-consumer remains the audit read owner.
- Events consolidated: no event changes.
- Models consolidated: no new Activity, audit, projection, or ledger model.
- Risky legacy code intentionally retained: no repair/delete/backfill mutation was added.
- Remaining technical debt: orphan summary is page-scoped; full tenant-wide orphan inventory would require an explicitly bounded batch/reporting contract.
- Architectural risks still present: per-operation audit lookup is bounded by page size because audit-consumer does not currently expose a batch operationId filter.

### Remaining Risks

- A backfill operation spanning page boundaries may appear in multiple page-scoped groups.
- If audit-consumer is unavailable, the report correctly degrades to `INCONCLUSIVE` and does not prove orphan status.
- `fromBackfilledAt`/`toBackfilledAt` filtering is applied to bounded candidate rows using existing JSON metadata rather than a dedicated indexed column.

### Next Recommended Slice

Add a small operator runbook for interpreting `AUDIT_MISSING` versus `INCONCLUSIVE` orphan metadata results before designing any repair workflow.

## Operator Runbook for Finance Timeline Backfill Consistency Findings

Create an operator-facing runbook for interpreting readiness, dry-run backfill plan, execution, audit history, consistency, and orphan metadata findings before any repair workflow is designed.

### Reuse Map

- Existing runbook/docs location: `docs/runbooks`.
- Existing authority hardening plan: this document remains the tranche ledger.
- Existing operational docs: `docs/runbooks/incident-response.md`, `docs/runbooks/prisma-migration-guide.md`, and related runbooks.
- Existing endpoint documentation: previous finance timeline idempotency/backfill sections in this plan.
- Existing audit/admin docs: admin audit page and audit-consumer sections in this plan.
- New documentation absolutely required: one focused runbook at `docs/runbooks/finance-timeline-backfill-consistency.md`.
- Why it does not conflict: it consolidates operator interpretation in the existing runbook home and links back to the authority-hardening plan; it adds no route, UI, table, repair workflow, or operational behavior.
- Conflict risks: documenting repair too strongly could imply an approved repair process, so the runbook explicitly prohibits manual SQL fixes, deletes, audit mutation, finance mutation, and automatic remediation.

### Runbook Location

Permanent runbook:

`docs/runbooks/finance-timeline-backfill-consistency.md`

### Main Interpretation Rules

- `CONSISTENT` means sanitized audit `counts.updated` agrees with Activity metadata count.
- `COUNT_MISMATCH` and `ACTIVITY_METADATA_MISSING` require investigation and escalation; no automatic repair exists.
- `AUDIT_MISSING` means Activity metadata references a backfill operation but the sanitized audit read path found no matching audit record.
- `INCONCLUSIVE` is not success and not proof of orphaning; retry after dependency recovery or escalate.
- Duplicate, ambiguous, and missing-source readiness blockers must stop automatic backfill.

### Decision Tree Summary

The runbook instructs operators to:

1. run readiness;
2. stop for duplicate, ambiguous, or missing-source blockers;
3. run dry-run plan;
4. execute only explicit eligible Activity IDs after approval;
5. review audit history;
6. run consistency;
7. run orphan mode only when audit drift is suspected;
8. escalate unresolved mismatch, missing-audit, or inconclusive findings.

### Endpoint Reference Summary

The runbook documents:

- `GET /api/v1/internal/finance-timeline/idempotency-readiness`
- `POST /api/v1/internal/finance-timeline/idempotency-backfill-plan`
- `POST /api/v1/internal/finance-timeline/idempotency-backfill-execute`
- `GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency`
- `GET /api/v1/internal/finance-timeline/idempotency-backfill-consistency?mode=orphan-metadata`
- `GET /api/v1/internal/audit/internal-operations`
- `/admin/audit` and `/api/admin/audit/internal-operations`

### Limitations

- Orphan metadata reporting remains page-scoped, not a full tenant inventory.
- Audit lookup in orphan mode is bounded per page.
- Reports do not repair drift.
- Backfill execution only updates explicit eligible Activity IDs.
- Audit strictness is not a distributed transaction rollback mechanism.
- The partial unique expression index may not appear in Prisma schema.
- Historical duplicates are not automatically fixed.

### Future Repair Prerequisites

Before any repair workflow is designed:

- durable audit evidence must exist or be reconstructed through an approved audited path;
- mutation must be bounded, explicit, tenant-scoped, dry-run-first, plan-hash protected, and operator-approved;
- tests must cover authorization, dry-run, mutation limits, sanitization, audit, and idempotency;
- finance aggregates must not be mutated;
- Activity deletes must not be included in the first repair design;
- rollback/recovery strategy must be documented.

### Cleanup Report

- Docs updated: added `docs/runbooks/finance-timeline-backfill-consistency.md` and linked it from this plan.
- Duplicate docs avoided: reused existing `docs/runbooks` home and this authority-hardening plan.
- Unsafe guidance avoided: no manual SQL repair, Activity delete, audit mutation, finance mutation, index disabling, or automatic remediation is recommended.
- Remaining operational gaps: no approved repair workflow exists; this is intentionally interpretation and escalation only.
- Architectural risks still present: orphan reports are page-scoped and audit lookup remains per-operation within the bounded page.

### Remaining Risks

- Operators still need judgment for duplicate and ambiguous historical rows.
- Persistent `AUDIT_MISSING` findings require an approved audit reconstruction or repair design before any mutation.
- Very large tenants may require carefully filtered repeated report runs.

### Next Recommended Slice

Design a no-mutation repair proposal template for persistent `AUDIT_MISSING` and `COUNT_MISMATCH` findings, including evidence requirements and approval gates, before implementing any repair endpoint.

## No-Mutation Repair Proposal Template and Approval Gates

Add a governance-only proposal template for persistent finance timeline backfill drift findings. This tranche does not introduce repair tooling, mutation behavior, services, routes, UI, tables, events, or workflows.

### Reuse Map

- Existing runbook/docs location: `docs/runbooks`.
- Existing authority hardening plan: this document remains the tranche ledger.
- Existing operational docs: incident response, Prisma migration, database/Redis failover, and security runbooks.
- Existing repair/escalation/change-control docs: no dedicated repair proposal template was found, so the existing finance timeline runbook was extended.
- Existing audit/admin docs: the current runbook and admin audit/audit-consumer sections in this plan.
- New documentation absolutely required: a no-mutation repair proposal template inside `docs/runbooks/finance-timeline-backfill-consistency.md`.
- Why it does not conflict: the template is colocated with the existing operator runbook and explicitly does not approve or execute repair.
- Conflict risks: repair wording can imply permission to mutate, so the template labels prohibited actions and future-tooling prerequisites separately from investigation and proposal.

### Template Location

Updated permanent runbook:

`docs/runbooks/finance-timeline-backfill-consistency.md`

### Evidence Requirements

The template requires sanitized evidence from:

- readiness report;
- dry-run backfill plan;
- backfill execution report, if applicable;
- audit history;
- consistency report;
- orphan metadata report;
- admin audit filtered view;
- relevant logs/correlation IDs;
- sanitized source event IDs;
- sanitized Activity IDs.

It prohibits raw customer payloads, raw finance event payloads, raw Activity `customFields`, secrets, service tokens, and raw audit metadata dumps.

### Approval Gates

Minimum approvals:

- platform/architecture owner;
- CRM timeline owner;
- audit owner;
- data or business owner where tenant data is affected.

Conditional approvals:

- compliance/security for audit-affecting proposals;
- finance/revenue owner when finance-facing records are referenced;
- engineering lead for code/tooling changes;
- QA for executable repair.

### Risk Classes

- `LOW`: observe-only, rerun read-only reports, rerun dry-run plan, no mutation.
- `MEDIUM`: metadata-only Activity correction with explicit IDs, no finance/audit mutation, approved dry-run and plan hash.
- `HIGH`: audit reconstruction request, ambiguous duplicate resolution, missing source ID recovery, stale plan hash or broad tenant investigation.
- `PROHIBITED_WITHOUT_NEW_APPROVED_DESIGN`: finance aggregate mutation, AuditLog mutation, Activity deletion, disabling indexes, unbounded database repair, replaying mutation commands.

### Prohibited Actions

The template prohibits:

- deleting Activity or AuditLog rows;
- editing finance aggregates;
- disabling or weakening the unique index;
- bypassing the backfill executor for metadata marking;
- broad database updates without an approved migration/runbook;
- mutating raw audit records;
- replaying finance events as mutation commands;
- using projections as source of truth;
- exposing service tokens;
- including raw customer/finance payloads.

### Validation Requirements

Every future repair proposal must define verification by rerunning readiness, dry-run plan if relevant, consistency, orphan metadata reporting, and admin audit review. It must also verify no new duplicate Activity rows, no finance aggregate mutation, no raw payload exposure, and documented operation evidence.

### Future Repair Tooling Prerequisites

Before any repair endpoint/tool is designed:

- approved repair proposal;
- exact affected Activity IDs;
- exact operation/correlation evidence;
- dry-run result;
- `planHash` or deterministic equivalent;
- explicit approval gates;
- sanitized audit trail;
- bounded scope;
- idempotency behavior;
- rollback/recovery plan;
- tests;
- blueprint update.

Future tooling must never perform broad unbounded updates, repair duplicates automatically, reconstruct audit without approval, mutate finance records, expose raw payloads, bypass audit strictness, or bypass service-token/internal access.

### Decision Tree Update

The runbook decision tree now routes persistent `COUNT_MISMATCH`, `ACTIVITY_METADATA_MISSING`, `AUDIT_MISSING`, unresolved `INCONCLUSIVE`, and duplicate/ambiguous blockers into evidence collection, risk classification, and repair proposal creation. It still blocks automatic repair.

### Cleanup Report

- Docs updated: `docs/runbooks/finance-timeline-backfill-consistency.md` and this authority-hardening plan.
- Duplicate docs avoided: no separate competing proposal document was created.
- Unsafe guidance avoided: no manual SQL repair procedure, delete path, audit mutation, finance mutation, index disabling, or automatic remediation was added.
- Remaining operational gaps: no executable repair process exists; proposals are governance artifacts only.
- Architectural risks still present: future repair tooling needs a separate design, tests, audit behavior, and rollback plan.

### Remaining Risks

- Operators may still need engineering help to classify ambiguous historical duplicates.
- Persistent audit drift has no approved repair mechanism yet.
- A future repair process will need careful proof that audit truth is not being rewritten incorrectly.

### Next Recommended Slice

Create a non-executable evidence packet checklist or ticket form for finance timeline backfill drift proposals, using this template as the source of truth.

## Non-Executable Evidence Packet for Finance Timeline Backfill Drift

Add a practical, fillable evidence packet/ticket form for operators to open controlled engineering review on persistent finance timeline backfill drift findings. This tranche is documentation-only and does not create a ticketing system, approval system, repair workflow, endpoint, UI, service, table, event, or mutation path.

### Reuse Map

- Existing runbook/docs location: `docs/runbooks`.
- Existing authority hardening plan: this document remains the tranche ledger.
- Existing operational docs: incident response, Prisma migration, database/Redis failover, and security runbooks.
- Existing ticket/change-request templates: none found.
- Existing incident-response docs: `docs/runbooks/incident-response.md`.
- Existing audit/admin docs: finance timeline runbook plus audit-consumer/admin audit sections in this plan.
- New documentation absolutely required: evidence packet appendix in `docs/runbooks/finance-timeline-backfill-consistency.md`.
- Why it does not conflict: it reuses the existing finance timeline runbook and references the no-mutation proposal template as the source of truth.
- Conflict risks: a ticket form could be mistaken for approval to repair, so the packet explicitly has no repair execution option and preserves prohibited-action attestations.

### Evidence Packet Location

Updated runbook:

`docs/runbooks/finance-timeline-backfill-consistency.md`

### Sections Added

- Request metadata.
- Finding summary.
- Evidence collection checklist.
- Endpoint evidence reference.
- Impact assessment.
- Root cause hypothesis.
- Proposed next action.
- Risk classification.
- Approval gate checklist.
- Safety attestation.
- Validation plan.
- Final review decision.

### Checklist Added

A condensed operational checklist was added with:

- before opening ticket;
- evidence required;
- sanitization required;
- approval required;
- must-not-do checks;
- after review;
- escalation triggers.

### Decision Tree Linkage

The runbook decision tree now routes persistent `COUNT_MISMATCH`, `ACTIVITY_METADATA_MISSING`, `AUDIT_MISSING`, and unresolved `INCONCLUSIVE` outcomes to evidence-packet completion before escalation or repair proposal review.

### Safe Sample Ticket

A sanitized sample ticket was added using redacted tenant, operation, correlation, source event, Activity, and audit IDs. It includes no raw payloads, no customer data, no secrets, no service tokens, and no repair instructions. The sample final decision is `needs more evidence`.

### Prohibited Actions Preserved

The packet preserves the existing prohibitions against:

- repair execution from the ticket;
- Activity deletion or manual metadata editing;
- AuditLog mutation;
- finance aggregate mutation;
- index disabling;
- broad unbounded operations;
- raw payload/customer-data attachments;
- service token or secret exposure.

### Cleanup Report

- Docs updated: `docs/runbooks/finance-timeline-backfill-consistency.md` and this plan.
- Duplicate docs avoided: no separate ticket template or ticketing system was created.
- Unsafe guidance avoided: no manual SQL repair, delete procedure, audit mutation, finance mutation, index disabling, or automatic remediation guidance was added.
- Remaining operational gaps: the packet enables controlled review but still does not execute repair or approve future tooling.
- Architectural risks still present: persistent drift still requires separate engineering design and approval before any repair workflow exists.

### Remaining Risks

- Operators must still choose bounded filters carefully for large tenants.
- Engineering review is required to turn accepted evidence packets into any future repair design.
- No persistent workflow/ticket automation exists; the packet is documentation only.

### Next Recommended Slice

Create a non-executable review rubric for engineering/platform owners to score submitted evidence packets before approving any future repair design.

## Focused Web Preview Cleanup - RFQ Detail, Quote Deep-Link, and CPQ Surface Separation

### Reuse Map

- Existing RFQ detail page/component: `apps/web/src/app/(dashboard)/rfqs/[id]/page.tsx`.
- Existing RFQ BFF/dev-preview routes: `apps/web/src/app/api/finance/rfqs/route.ts`, `apps/web/src/app/api/finance/rfqs/[id]/route.ts`, `apps/web/src/app/api/finance/rfqs/[id]/send/route.ts`, and `apps/web/src/app/api/finance/rfqs/[id]/convert/route.ts`.
- Existing RFQ data hook/client: `apps/web/src/hooks/use-rfqs.ts`.
- Existing quote detail page/component: `apps/web/src/app/(dashboard)/quotes/[id]/page.tsx`.
- Existing quote BFF route: `apps/web/src/app/api/quotes/[id]/route.ts`.
- Existing quote list preload/cache behavior: `apps/web/src/hooks/use-quotes.ts` React Query keys.
- Existing quote template/package admin/settings owner: quote automation/settings surface and existing quote-template BFF.
- Existing seller/admin permission helpers: `useAuthStore` roles and permissions.
- Existing DRQ component: quote detail page DRQ form.
- Existing account list/hydration pattern: `apps/web/src/app/(dashboard)/accounts/page.tsx`.
- New additions absolutely required: no new route family, service, table, data system, or UI page; only existing route/hook/page fixes and focused tests.
- Why they do not conflict: all changes reuse the current web BFF and dev-preview data owner; workflow mutations still proxy through existing finance-owned BFF routes.
- Conflict risks: quote creation and package rendering controls are authority-sensitive, so this tranche only hides/relabels UI affordances and does not create new flows.

### RFQ Detail Fix

- RFQ detail now reads through the existing `/api/finance/rfqs/:id` BFF route instead of browser-direct finance-service URLs.
- The RFQ detail BFF route now serves `rfq-nova-cx` from existing dev-preview state in local preview and proxies to finance-service outside preview.
- The RFQ send route now has a local dev-preview `SUBMITTED_FOR_REVIEW` behavior using canonical `rfq.submitted_for_review` preview timeline events.
- Missing RFQs return the existing sanitized `NOT_FOUND` envelope.

### Quote Deep-Link Fix

- `useQuote(id)` now fetches the existing same-origin `/api/quotes/:id` BFF route directly.
- Quote detail no longer depends on quote-list preload/cache to render `quote-nova-cpq-v1`.
- Same-origin quote helper fetches include the current bearer token when available.

### Seller/Admin Control Classification

- `Send quote`, `Download PDF`, `Share Portal Link`, `Void`, `Send for signature`, and DRQ submission remain seller workflow actions where status permits.
- Template selection and package rendering are classified as admin/governance actions and are only shown to admin or explicit template/admin permissions.
- Seller quote package view is read-only and points governance ownership to admin settings.
- Existing rendered document, revision, e-sign envelope, and governance-state counts remain visible.

### New Quote Decision

- Quotes list no longer presents a generic seller-facing `New Quote` action.
- Admins retain an `Admin quote builder` affordance.
- Non-admin users are directed to `Start from RFQ`, preserving the RFQ/deal contextual authority path.
- No new quote creation flow was introduced.

### RFQ Label and Affordance Updates

- RFQ detail uses `Submit for review` instead of `Send RFQ`.
- Conversion is shown only for statuses that can reasonably convert (`READY_FOR_QUOTE`, `RESPONDED`, `REVIEWING` in the existing preview model).
- Non-ready RFQs show disabled `Convert after review` instead of an executable conversion button.
- Converted RFQs show `View Quote`.

### DRQ Revision Context

- Quote detail now displays the current revision context beside the DRQ form.
- If a current revision is unavailable, the UI shows that DRQ submission is blocked rather than inventing a revision ID.
- Existing DRQ submit payload still uses the latest existing revision ID.

### Account Hydration Investigation

- Accounts page hydration warnings were traced to client-side auth/session and persisted UI state diverging from server fallback render.
- A small hydration gate was added to render a stable table skeleton until client auth state is available.
- No account data logic or API ownership changed.

### Workflow Verification Table

| Workflow | URL | Data source | Behavior after | Status |
| --- | --- | --- | --- | --- |
| RFQ detail direct load | `/rfqs/rfq-nova-cx` | `/api/finance/rfqs/:id` BFF/dev-preview | Loads `RFQ-2026-000003`, converted state, and `View Quote` | FIXED_AND_TESTED |
| Quote detail direct load | `/quotes/quote-nova-cpq-v1` | `/api/quotes/:id` BFF/dev-preview | Loads `Q-2026-000003` without list preload | FIXED_AND_TESTED |
| Quotes list | `/quotes` | `/api/quotes` BFF/dev-preview | Shows current quote and contextual/admin create affordance | FIXED_AND_TESTED |
| RFQ list | `/rfqs` | `/api/finance/rfqs` BFF/dev-preview | Shows current RFQ list | FIXED_AND_TESTED |
| Quote seller/admin controls | `/quotes/quote-nova-cpq-v1` | UI roles/permissions | Governance controls gated; package data remains read-only | FIXED_AND_TESTED |
| DRQ revision context | `/quotes/quote-nova-cpq-v1` | quote revisions BFF | Shows current revision binding | FIXED_AND_TESTED |
| Account hydration | `/accounts` | accounts BFF + auth store | Hydration warning cleared in preview smoke | FIXED_AND_TESTED |
| Deal detail quote linkage | `/deals/deal-nova-proposal` | deals/QuoteProjection BFF | Quote linkage visible; one unrelated 500 remains for a child widget | NEEDS_BACKEND_CHECK |

### Tests Added or Updated

- Added RFQ preview BFF route tests for detail success and not-found behavior.
- Updated RFQ hooks tests to assert same-origin `/api/finance/rfqs` BFF usage.
- Updated quote hook tests to assert direct detail fetch through `/api/quotes/:id`.
- Re-ran QuoteProjection history BFF tests to preserve projection-backed quote reads.

### Cleanup Report

- Duplicate logic removed: none introduced.
- Dead code removed: none.
- Routes consolidated: RFQ detail now reuses the existing RFQ BFF route family.
- UI controls hidden/moved/relabelled: seller generic `New Quote` is contextualized, RFQ labels reflect review flow, package governance controls are admin-gated, DRQ revision context is visible.
- Risky items intentionally retained: admin quote builder route remains for admin users pending deeper authority review.
- Remaining technical debt: RFQ detail still does not expose full review/respond/return/ready workflow controls; quote template governance likely deserves a dedicated admin flow.
- Architectural risks still present: deal detail has one non-blocking 500 child request in local preview; quote creation authority should be reviewed against production role policy.

### Remaining Risks

- Admin users can still access the existing quote builder; backend validation remains the authority gate.
- RFQ workflow UI is still a thin surface compared with the backend FSM.
- Deal detail preview has a child request returning 500 that did not block CPQ quote linkage.

### Next Recommended Slice

Review and harden the remaining seller/admin CPQ surfaces: quote builder access policy, package governance placement, and full RFQ review/ready action UX against the existing finance transition endpoints.

## Focused Deal Notes Preview / BFF Cleanup

### Reuse Map

- Existing deal detail page/component: `apps/web/src/app/(dashboard)/deals/[id]/page.tsx`.
- Existing notes UI/component: deal detail `NotesTab` and shared notes hooks.
- Existing notes BFF route: existing `/api/deals/[[...path]]` catch-all route.
- Existing deal notes API route: `/api/deals/:id/notes`, consumed by `useDealNotes`.
- Existing owner for notes: CRM notes domain, represented by `services/crm-service/src/routes/notes.routes.ts`.
- Existing owner for activities/comments: CRM Activity/Note models; deal timeline preview already derives activities from `getDevPreviewState().activities`.
- Existing dev-preview data owner: `apps/web/src/lib/server/dev-preview-data.ts`.
- Existing local preview data for deal notes: no separate preview `Note` records currently exist; deal notes should therefore return a stable empty paginated result rather than invent note semantics.
- Existing service URL/proxy pattern: production BFF proxies to CRM service with auth and tenant headers.
- Existing tests: web route tests and RFQ/quote preview route patterns.
- New additions absolutely required: one dev-preview branch in the existing deal BFF route, scoped notes error handling in the existing deal detail tab, and focused route tests.
- Why they do not conflict: the change reuses the current route family and CRM notes ownership; no notes module, table, data flow, or route family was added.
- Conflict risks: deriving notes from activities would blur Note vs Activity ownership, so the preview notes branch intentionally returns an empty Note page until real preview notes exist.

### Root Cause

- Failure class: `DIRECT_SERVICE_UNAVAILABLE` caused by missing local dev-preview handling for `/api/deals/:id/notes`.
- The deal detail page called the same-origin BFF correctly.
- The existing deal catch-all BFF handled deal detail, timeline, quotes, orders, stakeholders, competitors, governance, documents, and mutations, but not notes.
- In local preview, the request fell through to the CRM service proxy at `CRM_URL`, which is not required for the current preview, producing `ECONNREFUSED` and a 500.

### Route and Data Owner Decision

- CRM service remains the authoritative notes owner.
- Web BFF remains a thin local preview/proxy boundary.
- Local preview uses the existing dev-preview owner and returns an empty paginated notes result because no canonical preview note records exist.
- No fake notes were added outside the dev-preview owner, and no Activity rows were reclassified as Notes.

### Fix Applied

- Added a dev-preview branch for `GET /api/deals/:id/notes` in `apps/web/src/app/api/deals/[[...path]]/route.ts`.
- Added sanitized `UPSTREAM_UNAVAILABLE` handling around the production CRM proxy fetch.
- Updated deal detail `NotesTab` to show a scoped notes warning if notes fail, while keeping the deal record and commercial data visible.

### Response Shape

- Local preview response is the existing success envelope containing the existing paginated shape:
  - `data`
  - `total`
  - `page`
  - `limit`
  - `totalPages`
  - `hasNextPage`
  - `hasPrevPage`
- Missing preview notes now return `data: []` with preserved pagination params instead of a 500.

### UI Resilience Behavior

- Notes loading state remains unchanged.
- Empty notes render the existing `No notes` empty state.
- Notes failures render a local warning and do not break the whole deal detail page.
- Raw service URLs, stack traces, and service tokens are not exposed.

### Tests Added

- Added `apps/web/src/app/api/deals/deal-notes-preview.route.test.ts`.
- Covered:
  - `/api/deals/deal-nova-proposal/notes` returns 200 in dev preview.
  - empty notes preserve pagination metadata.
  - upstream connection failures return sanitized `UPSTREAM_UNAVAILABLE`.
  - service-token headers are not exposed by the route.

### Preview Smoke Result

| Surface | Result | Status |
| --- | --- | --- |
| `/api/deals/deal-nova-proposal/notes?page=1&limit=50` | Returns 200 with paginated empty notes | FIXED_AND_TESTED |
| `/deals/deal-nova-proposal` | Deal page loads and notes tab renders `No notes` | FIXED_AND_TESTED |
| `/quotes/quote-nova-cpq-v1` | Still loads quote detail | FIXED_AND_TESTED |
| `/rfqs/rfq-nova-cx` | Still loads RFQ detail | FIXED_AND_TESTED |

### Cleanup Report

- Duplicate logic removed: none introduced.
- Dead code removed: none.
- Routes consolidated: notes handling added to the existing deal BFF catch-all instead of creating a new route family.
- UI error handling improved: notes failure is scoped to the notes tab.
- Risky items intentionally retained: no preview note seed was invented; local preview remains empty until an authoritative preview Note owner is added.
- Remaining technical debt: deal notes preview has no sample Note records; production still depends on CRM service availability for real notes.
- Architectural risks still present: broad CRM note write flows were not reviewed in this slice.

### Remaining Risks

- Operators cannot visually inspect populated deal notes in local preview until real preview notes exist under the proper owner.
- The CRM service remains required for production notes; this slice only sanitizes unavailable upstream failures.

### Next Recommended Slice

Add an owner-approved preview Note seed under the existing dev-preview data owner, or review the broader CRM notes UI/BFF path for contact, lead, and deal parity.

## Focused Web Preview Cleanup - Runtime Fixes

### Reuse Map

- Existing RFQ list page: `apps/web/src/app/(dashboard)/rfqs/page.tsx`.
- Existing RFQ detail page: `apps/web/src/app/(dashboard)/rfqs/[id]/page.tsx`.
- Existing RFQ BFF routes: `apps/web/src/app/api/finance/rfqs/route.ts`, `apps/web/src/app/api/finance/rfqs/[id]/route.ts`, `send/route.ts`, and `convert/route.ts`.
- Existing RFQ dev-preview data: `apps/web/src/lib/server/dev-preview-data.ts` (`rfq-nova-cx` / `RFQ-2026-000003`).
- Existing RFQ client/hook: `apps/web/src/hooks/use-rfqs.ts`.
- Existing quote list page: `apps/web/src/app/(dashboard)/quotes/page.tsx`.
- Existing quote detail page: `apps/web/src/app/(dashboard)/quotes/[id]/page.tsx`.
- Existing quote BFF routes: `apps/web/src/app/api/quotes/route.ts`, `[id]/route.ts`, `[id]/revisions/route.ts`, `[id]/documents/route.ts`, `[id]/render/route.ts`, `[id]/esign/route.ts`, and related finance BFF routes.
- Existing quote detail hook/cache behavior: `apps/web/src/hooks/use-quotes.ts` React Query keys and same-origin helper fetches.
- Existing quote package/template controls: quote detail package panel and admin-owned `apps/web/src/app/(dashboard)/settings/quote-automation/page.tsx`.
- Existing seller/admin permission helpers: `useAuthStore` roles and permissions.
- Existing quote template/settings/admin surface: quote automation settings page and `/api/finance/quote-templates`.
- Existing New Quote action target: `/quotes/new`, retained as admin-only `Admin quote builder`; sellers are directed to `/rfqs`.
- Existing DRQ UI/component: quote detail `Create DRQ` form.
- Existing currentRevisionId/revision data shape: `QuoteRevision.id`, `quoteId`, and `version` from `/api/quotes/:id/revisions`.
- Existing accounts page hydration/error behavior: accounts page now gates client-only auth/persisted UI state behind a stable skeleton and lazy-loads map UI client-side.
- New additions absolutely required: focused page/hook tests and one hook option to prevent seller sessions from fetching admin quote templates.
- Conflict risks: none introduced; no new route, service, preview data system, backend workflow, or authority path was added.

### Runtime Fixes

- RFQ detail uses the existing `useRFQ()` same-origin BFF path and renders stable not-found/error states.
- Quote detail uses `/api/quotes/:id` directly and no longer depends on quote-list preload/cache.
- Quote template/package governance controls remain admin/permission gated.
- Seller sessions no longer initialize/fetch quote templates; `useQuoteTemplates({ enabled: false })` remains idle.
- Quotes list contextualizes quote creation: admin users see `Admin quote builder`; non-admin users see `Start from RFQ`.
- RFQ action labels use hardened lifecycle language (`Submit for review`, disabled `Convert after review`, `View Quote` when converted).
- DRQ submission shows the current revision binding and blocks missing revision context.
- Accounts hydration warning was investigated and remains covered by the client hydration gate; preview smoke showed no `Hide Errors` overlay.

### Tests Added or Updated

- Added `apps/web/src/app/(dashboard)/quotes/[id]/page.test.tsx`.
- Added `apps/web/src/app/(dashboard)/rfqs/[id]/page.test.tsx`.
- Updated `apps/web/src/hooks/__tests__/use-quotes.test.tsx`.
- Coverage includes seller/admin CPQ template separation, disabled template fetches, DRQ revision context, RFQ lifecycle labels, and RFQ not-found state.

### Preview Smoke Result

| Surface | Result | Status |
| --- | --- | --- |
| `/rfqs/rfq-nova-cx` | Renders Nexus CRM RFQ detail without Network Error | FIXED_AND_TESTED |
| `/quotes/quote-nova-cpq-v1` | Direct deep-link renders `Q-2026-000003` without staying on loading | FIXED_AND_TESTED |
| `/quotes` | Renders current quote list and admin/contextual entry label | FIXED_AND_TESTED |
| `/rfqs` | Renders `RFQ-2026-000003` list row | FIXED_AND_TESTED |
| `/accounts` | Renders accounts page without framework overlay or `Hide Errors` UI | FIXED_AND_TESTED |
| `/deals/deal-nova-proposal` | Renders deal detail and quote linkage | FIXED_AND_TESTED |

### Cleanup Report

- Duplicate logic removed: none introduced.
- Dead code removed: none.
- Routes consolidated: no new routes were added; existing BFF/dev-preview routes remain the owners.
- UI controls hidden/moved/relabelled: admin package rendering is gated, seller quote entry points route through RFQ, and RFQ labels now match the hardened lifecycle vocabulary.
- Risky items intentionally retained: admin quote builder remains for admin users and still relies on backend authority validation.
- Remaining technical debt: full RFQ review/respond/return/ready workflow controls are still a future UX slice.
- Architectural risks still present: quote mutation buttons beyond the preview load path should be reviewed for same-origin BFF coverage in a later slice.

### Remaining Risks

- Local realtime service absence still creates websocket console noise when `localhost:3005` is not running.
- The in-app browser can retain stale session state; a hard refresh rehydrates the dev-preview admin session.
- Admin quote builder existence still needs a deeper authority review against production role policy.

### Next Recommended Slice

Review quote workflow mutation buttons for same-origin BFF coverage and status-aware seller/admin action gating, without creating new finance authority or frontend-owned transitions.

## Focused Deal Notes BFF Cleanup

### Reuse Map

- Existing deal detail page: `apps/web/src/app/(dashboard)/deals/[id]/page.tsx`.
- Existing deal notes component: the deal detail `NotesTab`, backed by `useDealNotes`.
- Existing BFF route for `/api/deals/[id]/notes`: `apps/web/src/app/api/deals/[[...path]]/route.ts`.
- Existing CRM/deals service route for notes: production BFF proxy to `CRM_SERVICE_URL /api/v1/deals/:id/notes`.
- Existing Activity/notes owner: CRM notes/activity ownership remains behind the existing notes/deals BFF paths; no web-owned persistence was added.
- Existing dev-preview notes data: no dedicated deal note seed exists; the current preview route intentionally returns a stable empty page.
- Existing deal preview data: `deal-nova-proposal` in `apps/web/src/lib/server/dev-preview-data.ts`.
- Existing API hook/client: `apps/web/src/hooks/use-notes.ts` `useDealNotes`.
- Existing auth/dev-preview handling: `DEV_PREVIEW_ENABLED`, bearer auth, and existing BFF proxy headers.
- Existing tests extended/reused: `apps/web/src/app/api/deals/deal-notes-preview.route.test.ts`.
- New additions absolutely required: none; the existing route and test already covered the desired stable empty preview behavior.
- Conflict risks: low; no route, table, service, preview data flow, or note/comment module was added.

### Issue Classification

- Live preview initially returned 500 for `/api/deals/deal-nova-proposal/notes?page=1&limit=50`.
- Root cause: `CACHE_STALE` / Next dev runtime cache mismatch. The dev server log showed `Cannot find module './5110.js'` from `.next/server/webpack-runtime.js` after build/dev churn.
- It was not a missing BFF route, missing preview branch, or notes ownership gap.

### Route Behavior Before and After

| Check | Before | After |
| --- | --- | --- |
| `/api/deals/deal-nova-proposal/notes?page=1&limit=50` | 500 due stale `.next` server chunk | 200 with stable empty paginated notes |
| `/api/deals/deal-nova-proposal/notes?page=2&limit=10` | Not trusted while cache was stale | 200 with page and limit preserved |
| `/api/deals/missing-deal/notes?page=1&limit=50` | Not checked | 404 stable `Deal not found` |
| invalid `page` / `limit` | No crash requirement | 200; shared preview paginator serializes invalid numbers as `null` |

No source change was needed for the BFF handler. Recovery used safe cache cleanup only: stopped the local Next dev process, removed `apps/web/.next`, and restarted the existing `pnpm --filter @nexus/web dev` command.

### UI Behavior

- `/deals/deal-nova-proposal` loads.
- Notes tab renders the existing `No notes` empty state.
- Notes failure remains scoped to the notes panel if it occurs.
- No `Hide Errors`, `Network Error`, raw service URL, stack trace, or service token was shown in preview smoke.

### Tests and Verification

- Reused existing focused route test: `pnpm --filter @nexus/web test -- src/app/api/deals/deal-notes-preview.route.test.ts`.
- Result: 3 tests passed.
- Verified live BFF response with `Invoke-WebRequest`.
- Verified deal page Notes tab with Playwright clean context.

### Cleanup Report

- Duplicate logic removed: none introduced.
- Dead code removed: none.
- Routes consolidated: existing `/api/deals/[[...path]]` remains the sole deal notes BFF path.
- UI error handling improved: no code change in this slice; existing scoped notes error state was verified.
- Risky items intentionally retained: no preview Note seed was invented; invalid preview pagination still returns `null` numeric fields rather than crashing.
- Remaining technical debt: shared dev-preview paginator could clamp invalid pagination parameters in a future low-risk utility cleanup.
- Architectural risks still present: production deal notes still depend on CRM service availability.

### Remaining Risks

- If `next build` and `next dev` are run concurrently or the dev server survives a build cache rewrite, `.next` can become stale again. Recovery is safe cache cleanup plus restart.
- Local preview has no seeded deal note content, so the expected visible state is empty notes.

### Next Recommended Slice

Normalize the shared dev-preview pagination helper to clamp invalid `page` and `limit` values, with focused tests across existing preview BFF routes.
