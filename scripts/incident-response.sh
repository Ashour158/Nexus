#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Incident Response Script

echo "=== Incident Response ==="

INCIDENT_ID="${1:-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "incidents/$INCIDENT_ID"

echo "Incident ID: $INCIDENT_ID"

# Collect logs
echo "[1/5] Collecting logs..."
kubectl logs -n nexus --all-containers --selector=app.kubernetes.io/name=nexus-crm --since=1h > "incidents/$INCIDENT_ID/logs.txt" 2>/dev/null || true

# Collect events
echo "[2/5] Collecting events..."
kubectl get events -n nexus --sort-by='.lastTimestamp' > "incidents/$INCIDENT_ID/events.txt" 2>/dev/null || true

# Collect pod status
echo "[3/5] Collecting pod status..."
kubectl get pods -n nexus -o yaml > "incidents/$INCIDENT_ID/pods.yaml" 2>/dev/null || true

# Collect metrics
echo "[4/5] Collecting metrics..."
kubectl top pods -n nexus > "incidents/$INCIDENT_ID/metrics.txt" 2>/dev/null || true

# Collect network info
echo "[5/5] Collecting network info..."
kubectl get services,endpoints,ingress -n nexus -o yaml > "incidents/$INCIDENT_ID/network.yaml" 2>/dev/null || true

echo "✅ Incident data collected: incidents/$INCIDENT_ID/"
