# Domain Engine Reorganization Design

Date: 2026-05-19

## Goal

Reorganize Nexus CRM so business logic is owned by domains and shared engines, while the UI remains organized by user-facing workflows.

## Problem

The current system has feature-oriented routes and services. That is useful for screens, but it causes duplicated logic, route collisions, scattered validation, inconsistent bulk behavior, and fragile cross-module workflows.

Examples:

- lead conversion touches lead, account, contact, deal, coding, assignment, audit, outbox, reporting, and realtime updates
- quote approval touches quote, DRQ, approval policy, document rendering, e-sign, deal/account/contact timelines, audit, and reporting
- bulk updates must honor module validation, permissions, audit, outbox, and archival rules

These flows should not live inside screen-specific routes.

## Design

Use a progressive domain-engine refactor.

Frontend routes remain workflow-based:

- `/leads`
- `/contacts`
- `/accounts`
- `/deals`
- `/quotes`
- `/cadences`
- `/reports`
- `/settings`

Backend logic moves toward canonical domains:

- Identity
- Customer
- Sales
- Commercial
- Engagement
- Reporting

Shared business infrastructure moves into engines:

- validation
- coding/reference
- approval
- workflow/automation
- assignment/routing
- dedupe
- audit
- outbox/events
- documents/templates
- import/export
- reporting projections

## Constraints

- Do not break existing frontend routes.
- Do not perform a big-bang file move.
- Keep compatibility routes while canonical use cases are introduced.
- Delete old paths only after callers and tests prove they are obsolete.
- Keep AI and SaaS billing removed.
- Keep business logic non-AI and deterministic.

## Phase Plan

### Phase 1: Cleanup And Inventory

Create a cleanup inventory, canonical architecture map, ignore generated clutter, verify builds, and mark obsolete artifacts.

### Phase 2: Domain Core

Create shared domain primitives in a package:

- `packages/domain-core/src/result.ts`
- `packages/domain-core/src/errors.ts`
- `packages/domain-core/src/use-case.ts`
- `packages/domain-core/src/events.ts`
- `packages/domain-core/src/context.ts`
- `packages/domain-core/src/testing.ts`

### Phase 3: Customer And Sales Workflows

Introduce use cases:

- `ConvertLeadUseCase`
- `BulkUpdateRecordsUseCase`
- `ArchiveRecordUseCase`
- `CreateOrUpdateAccountUseCase`
- `CreateOrUpdateContactUseCase`
- `MoveDealStageUseCase`

Routes call these use cases instead of duplicating logic.

### Phase 4: Commercial Workflows

Introduce use cases:

- `CreateRfqUseCase`
- `CreateQuoteUseCase`
- `SubmitDiscountRequestUseCase`
- `ApproveDiscountRequestUseCase`
- `RenderQuoteDocumentUseCase`
- `ExpireQuoteUseCase`
- `ConvertQuoteToOrderUseCase`

### Phase 5: Event Nervous System

Normalize domain events, outbox publication, realtime updates, timeline events, reporting projections, and audit records.

### Phase 6: Compatibility Cleanup

Remove duplicate routes and service paths after callers are migrated and tests pass.

## Success Criteria

- API routes are thin controllers.
- Cross-module workflows live in use cases.
- Validation, coding, approval, audit, outbox, documents, and reporting are reusable engines.
- There is one canonical owner per business action.
- Web build and service typechecks remain green during each phase.
- No UI route breaks during migration.

