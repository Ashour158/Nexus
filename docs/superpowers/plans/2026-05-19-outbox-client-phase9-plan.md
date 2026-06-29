# Phase 9 - Finance Outbox Client Regeneration

## Goal

Regenerate the finance Prisma client after the normalized outbox migration, remove the compatibility raw-SQL shim, and verify commercial events are written through typed Prisma fields.

## Scope

- [x] Regenerate the finance Prisma client.
- [x] Remove compatibility outbox enrichment through raw SQL.
- [x] Write normalized outbox fields directly: `key`, `tenantId`, `aggregateType`, `eventType`, `retryCount`.
- [x] Update commercial outbox tests to assert typed normalized fields.
- [x] Run finance commercial regression tests and typechecks.
- [x] Attempt finance migration deploy.

## Migration Result

`pnpm --filter @nexus/finance-service db:migrate` was attempted after Docker started, but Prisma's schema engine returned an empty `Schema engine error` against the local Postgres instance.

The `nexus_finance` database did not exist, so it was created in the running `nexus-postgres` container. Because the finance migration folder is incremental and does not include a base init migration for an empty database, the current full Prisma schema was applied with:

```bash
prisma migrate diff --from-empty --to-schema-datamodel services/finance-service/prisma/schema.prisma --script | psql -U nexus -d nexus_finance
```

Verified local database state:

- `nexus_finance` exists.
- 37 public tables exist.
- `OutboxMessage` includes normalized columns: `key`, `tenantId`, `aggregateType`, `eventType`, `processedAt`, and `retryCount`.
- Outbox indexes exist for `status/createdAt`, `processedAt/retryCount/createdAt`, `aggregateType/aggregateId`, and `aggregateId`.

The migration file remains ready for managed environments at:

`services/finance-service/prisma/migrations/20260519162000_standardize_outbox_contract/migration.sql`
