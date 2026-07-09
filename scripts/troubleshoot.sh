#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Troubleshooting Script

echo "=== Nexus CRM Troubleshooting ==="

# Check pod status
echo "[1/7] Pod status:"
kubectl get pods -n nexus

# Check recent events
echo -e "\n[2/7] Recent events:"
kubectl get events -n nexus --sort-by='.lastTimestamp' | tail -20

# Check service endpoints
echo -e "\n[3/7] Service endpoints:"
kubectl get endpoints -n nexus

# Check logs for failing pods
echo -e "\n[4/7] Logs from failing pods:"
for pod in $(kubectl get pods -n nexus --field-selector=status.phase!=Running -o name); do
  echo "--- $pod ---"
  kubectl logs -n nexus "$pod" --tail=50 || true
done

# Check resource usage
echo -e "\n[5/7] Resource usage:"
kubectl top pods -n nexus 2>/dev/null || echo "⚠️ metrics-server not available"

# Check network connectivity
echo -e "\n[6/7] Network connectivity:"
kubectl run -n nexus --rm -i --restart=Never debug --image=busybox:1.36 -- wget -qO- http://graphql-gateway:4000/health 2>/dev/null || echo "⚠️ Gateway not reachable"

# Check persistent volumes
echo -e "\n[7/7] Persistent volumes:"
kubectl get pvc -n nexus

echo -e "\n✅ Troubleshooting complete"
