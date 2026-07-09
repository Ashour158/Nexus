# Database Failover Runbook

## Prerequisites
- Access to RDS console or `kubectl` for self-managed Postgres
- PgBouncer configured with fallback connections

## Steps

### 1. Verify Primary is Down
```bash
# Check primary health
pg_isready -h postgres-primary -p 5432

# Check replication lag
psql -h postgres-replica -U nexus -c "SELECT pg_last_xact_replay_timestamp();"
```

### 2. Promote Replica to Primary

**AWS RDS:**
```bash
aws rds promote-read-replica \
  --db-instance-identifier nexus-crm-replica \
  --region us-east-1
```

**Self-managed:**
```bash
# On replica node
pg_ctl promote -D /var/lib/postgresql/data
```

### 3. Update Connection Strings
```bash
# Update PgBouncer config
kubectl set env deployment/pgbouncer DATABASE_URL="postgresql://new-primary:5432/nexus" -n nexus

# Restart PgBouncer
kubectl rollout restart deployment/pgbouncer -n nexus
```

### 4. Verify Applications
```bash
# Check all services
./scripts/health-check.ts

# Monitor error rates
kubectl logs -n nexus -l app.kubernetes.io/name=nexus-crm --tail=50
```

### 5. Create New Replica
```bash
# AWS RDS
aws rds create-db-instance-read-replica \
  --db-instance-identifier nexus-crm-replica-new \
  --source-db-instance-identifier nexus-crm-primary \
  --region us-east-1
```

## Rollback
If failover causes issues, restore from latest backup:
```bash
./infrastructure/postgres/backup/restore.sh --pitr "$(date -Iseconds)"
```
