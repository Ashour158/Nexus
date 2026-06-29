# Phase 8 - Production Outbox Contract

## Goal

Standardize the commercial outbox contract so finance events are durable, relay-ready, and consumable by realtime/contact/account/deal projections without depending on best-effort Kafka publishes.

## Scope

- [x] Extend finance `OutboxMessage` Prisma model with relay-ready fields: `key`, `tenantId`, `aggregateType`, `eventType`, `processedAt`, and `retryCount`.
- [x] Add real finance migration for the normalized outbox contract.
- [x] Backfill normalized fields from existing `headers`, `payload`, and `sentAt` data where possible.
- [x] Keep backward compatibility with existing generated clients by writing the old shape first and enriching normalized columns through raw SQL when present.
- [x] Verify commercial outbox events still persist and publish after the compatibility change.
- [x] Run full commercial regression, finance typecheck, relay typecheck, web typecheck, and diff check.

## Contract

Every commercial outbox row should carry:

- `topic`: Kafka topic, currently `nexus.finance.quotes`.
- `payload`: event body with `type`, `tenantId`, `occurredAt`, `actorId`, and cross-module refs.
- `headers`: event metadata with `eventType`, `source`, `tenantId`, and `aggregateType`.
- `aggregateId`: business record id.
- `tenantId`: tenant scope.
- `aggregateType`: quote, RFQ, order, document, signature, discount request.
- `eventType`: stable event name.
- `processedAt` and `retryCount`: relay processing state.

## Compatibility

The commercial use-case still inserts fields supported by the older finance generated client, then enriches normalized columns when the migration has been applied. This keeps local development working before regeneration while making the database relay-ready after migration.
