# Redis Failover Runbook

## Prerequisites
- `kubectl` access to the nexus namespace
- `redis-cli` or `nc` for connectivity checks

## Architecture
Redis runs in HA mode with Sentinel:
- **redis-master**: 1 pod (write operations)
- **redis-replica**: 2 pods (read operations)
- **redis-sentinel**: 3 pods (monitoring + failover orchestration)

## Failure Scenarios

### 1. Master Down
```bash
# Check Sentinel logs
kubectl logs -n nexus -l app=redis-sentinel --tail=50

# Verify failover occurred
kubectl exec -n nexus deployment/redis-sentinel -- redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster

# Expected: one of the replica IPs becomes the new master
```

### 2. Replica Down
```bash
# Check replica status
kubectl get pods -n nexus -l app=redis-replica

# Redeploy if needed
kubectl rollout restart statefulset/redis-replica -n nexus
```

### 3. Sentinel Quorum Lost
```bash
# Check sentinel health
kubectl get pods -n nexus -l app=redis-sentinel

# Scale up if needed
kubectl scale deployment/redis-sentinel --replicas=3 -n nexus
```

## Client Reconfiguration
Applications using ioredis should configure Sentinel mode:
```typescript
import Redis from 'ioredis';

const redis = new Redis({
  sentinels: [
    { host: 'redis-sentinel-0.redis-sentinel.nexus.svc.cluster.local', port: 26379 },
    { host: 'redis-sentinel-1.redis-sentinel.nexus.svc.cluster.local', port: 26379 },
    { host: 'redis-sentinel-2.redis-sentinel.nexus.svc.cluster.local', port: 26379 },
  ],
  name: 'mymaster',
  role: 'master', // or 'slave' for read-only
});
```

## Rollback to Single Instance (Emergency Only)
```bash
kubectl delete -f infrastructure/k8s/redis-sentinel.yaml
kubectl apply -f infrastructure/k8s/redis-deployment.yaml
```
