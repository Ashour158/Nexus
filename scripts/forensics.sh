#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Forensics Collection Script

echo "=== Forensics Collection ==="

INCIDENT_ID="${1:-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "forensics/$INCIDENT_ID"

echo "Incident ID: $INCIDENT_ID"

# Collect node information
echo "[1/6] Collecting node information..."
kubectl get nodes -o yaml > "forensics/$INCIDENT_ID/nodes.yaml" 2>/dev/null || true

# Collect pod information
echo "[2/6] Collecting pod information..."
kubectl get pods -A -o yaml > "forensics/$INCIDENT_ID/pods.yaml" 2>/dev/null || true

# Collect network information
echo "[3/6] Collecting network information..."
kubectl get services,endpoints,ingress -A -o yaml > "forensics/$INCIDENT_ID/network.yaml" 2>/dev/null || true

# Collect RBAC information
echo "[4/6] Collecting RBAC information..."
kubectl get roles,rolebindings,clusterroles,clusterrolebindings -A -o yaml > "forensics/$INCIDENT_ID/rbac.yaml" 2>/dev/null || true

# Collect secrets (metadata only)
echo "[5/6] Collecting secrets metadata..."
kubectl get secrets -A -o yaml | sed 's/data:.*$/data: <redacted>/' > "forensics/$INCIDENT_ID/secrets.yaml" 2>/dev/null || true

# Collect audit logs
echo "[6/6] Collecting audit logs..."
kubectl logs -n kube-system -l app=kube-apiserver --tail=1000 > "forensics/$INCIDENT_ID/audit.log" 2>/dev/null || true

echo "✅ Forensics data collected: forensics/$INCIDENT_ID/"
