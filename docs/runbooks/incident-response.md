# Incident Response Runbook

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| SEV1 | Complete outage, data loss, security breach | 15 min |
| SEV2 | Major feature degradation, partial outage | 1 hour |
| SEV3 | Minor feature issue, workaround available | 4 hours |
| SEV4 | Cosmetic issue, no user impact | 24 hours |

## Response Playbook

### 1. Detection
- Monitor alerts in PagerDuty/Opsgenie
- Check dashboards: Grafana, Prometheus
- Review error logs in Loki

### 2. Triage
```bash
# Check service health
./scripts/health-check.ts

# Check recent events
kubectl get events -n nexus --sort-by='.lastTimestamp'

# Check pod status
kubectl get pods -n nexus -o wide
```

### 3. Communication
- SEV1/SEV2: Page on-call engineer immediately
- Create incident channel: `#incident-{YYYY-MM-DD}-{id}`
- Update status page

### 4. Mitigation
- Rollback if deployment-related: `./scripts/rollback.sh <service>`
- Scale up if capacity-related: `kubectl scale deployment/<svc> --replicas=10 -n nexus`
- Enable circuit breakers if upstream failure

### 5. Resolution
- Verify fix with health checks
- Monitor metrics for 30 minutes
- Update incident timeline
- Schedule post-mortem within 48 hours

### 6. Post-Mortem
```bash
./scripts/post-mortem.sh <incident-id>
```

## Common Scenarios

### Database Connection Pool Exhausted
```bash
# Check connection count
kubectl exec -n nexus deploy/postgres -- psql -U nexus -c "SELECT count(*) FROM pg_stat_activity;"

# Restart PgBouncer
kubectl rollout restart deployment/pgbouncer -n nexus

# Scale read replicas
kubectl scale deployment/postgres-replica --replicas=3 -n nexus
```

### Kafka Consumer Lag
```bash
# Check lag
kafka-consumer-groups --bootstrap-server kafka:9092 --describe --group nexus-crm-consumer

# Scale consumers
kubectl scale deployment/analytics-service --replicas=5 -n nexus

# Check DLQ
kubectl logs -n nexus -l app=analytics-service --tail=100 | grep "DLQ"
```

### High Error Rate
```bash
# Check traces
./scripts/trace-query.sh <trace-id>

# Check recent deployments
kubectl rollout history deployment/nexus-crm -n nexus

# Rollback if needed
kubectl rollout undo deployment/nexus-crm -n nexus
```

## Escalation

1. On-call engineer (15 min)
2. Team lead (30 min)
3. Engineering manager (1 hour)
4. CTO (SEV1 only, 2 hours)
