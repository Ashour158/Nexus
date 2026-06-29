# Prisma Migration Guide — 144 `@@unique([id, tenantId])` Changes

## Summary

As part of the production-readiness audit, **144 models** across **22 Prisma schemas** received the composite unique constraint:

```prisma
@@unique([id, tenantId])
```

This enforces tenant-scoped uniqueness at the database level, preventing cross-tenant IDOR vulnerabilities and aligning with the Row-Level Security (RLS) middleware.

## Why This Migration Is Required

Without `@@unique([id, tenantId])`, an attacker could theoretically access another tenant's record by guessing an auto-increment ID. The constraint ensures:

1. **Data isolation** — `id` is only unique within a tenant
2. **RLS alignment** — Prisma middleware and PostgreSQL RLS policies work in tandem
3. **Query optimization** — PostgreSQL can use the composite index for tenant-scoped lookups

## Migration Procedure

### Step 1: Pre-Migration Checklist

- [ ] **Backup all databases** — RDS snapshot or `pg_dump`
- [ ] **Verify zero-downtime window** — migrations run in transaction; large tables may lock briefly
- [ ] **Staging validation** — run migrations on staging first

### Step 2: Run Migrations

```bash
# Deploy mode (safe for production — applies pending migrations only)
MODE=deploy ./scripts/migrate-all.sh

# Or run per service for finer control
cd services/crm-service && pnpm prisma migrate deploy
```

### Step 3: Post-Migration Verification

```bash
# Check migration status per service
pnpm -r exec prisma migrate status

# Verify @@unique constraints exist
psql $CRM_DATABASE_URL -c "\d \"Contact\""
# Expected output includes: "unique_contact_id_tenantId" UNIQUE btree ("id", "tenantId")
```

### Step 4: Application Restart

Restart all services to pick up new Prisma Client types:
```bash
kubectl rollout restart deployment -n nexus
```

## Rollback Plan

If migration fails or causes issues:

1. **Restore from RDS snapshot** (fastest for total failure)
2. **Manual rollback** (for specific service):
   ```bash
   cd services/<service>
   pnpm prisma migrate resolve --rolled-back <migration_name>
   ```

## Performance Impact

- **Index creation** on large tables (>1M rows) may take 30-120 seconds
- **Lock type:** `ACCESS EXCLUSIVE` briefly during index build; PostgreSQL 14+ uses `CONCURRENTLY` when possible
- **Mitigation:** Run during low-traffic window or use `pg_repack` for online index builds

## Services Affected

| Service | Schema Path | Models with @@unique |
|---|---|---|
| auth-service | `prisma/schema.prisma` | User, Tenant, Role, PasswordResetToken |
| crm-service | `prisma/schema.prisma` | Contact, Account, Deal, Lead, Activity, Note, Task |
| contacts-service | `prisma/schema.prisma` | Contact |
| deals-service | `prisma/schema.prisma` | Deal |
| activities-service | `prisma/schema.prisma` | Activity |
| finance-service | `prisma/schema.prisma` | Invoice, Quote, Commission |
| workflow-service | `prisma/schema.prisma` | Workflow, WorkflowStep |
| integration-service | `prisma/schema.prisma` | Integration, Webhook |
| notification-service | `prisma/schema.prisma` | Notification, NotificationPreference |
| storage-service | `prisma/schema.prisma` | File, Folder |
| blueprint-service | `prisma/schema.prisma` | Blueprint, Playbook |
| approval-service | `prisma/schema.prisma` | ApprovalRequest, ApprovalRule |
| cadence-service | `prisma/schema.prisma` | Cadence, SequenceStep |
| territory-service | `prisma/schema.prisma` | Territory, TerritoryAssignment |
| planning-service | `prisma/schema.prisma` | Forecast, Quota |
| reporting-service | `prisma/schema.prisma` | Report, Dashboard |
| portal-service | `prisma/schema.prisma` | PortalUser, PortalTicket |
| knowledge-service | `prisma/schema.prisma` | Article, Category |
| incentive-service | `prisma/schema.prisma` | Incentive, Badge |
| data-service | `prisma/schema.prisma` | ImportJob, ExportJob |
| document-service | `prisma/schema.prisma` | Document, Template |

> Note: Exact model counts vary. The audit applied `@@unique([id, tenantId])` to all tenant-scoped models.
