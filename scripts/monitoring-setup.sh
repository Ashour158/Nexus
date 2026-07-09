#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Monitoring Setup Script

echo "=== Monitoring Setup ==="

# Install Prometheus Stack
if ! kubectl get ns monitoring &> /dev/null; then
  echo "Installing Prometheus Stack..."
  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
  helm repo update
  helm install prometheus prometheus-community/kube-prometheus-stack \
    --namespace monitoring \
    --create-namespace \
    --set grafana.adminPassword=admin
fi

# Wait for Prometheus
kubectl wait --for=condition=ready --timeout=300s pod -l app.kubernetes.io/name=prometheus -n monitoring

echo "✅ Monitoring setup complete"
echo "Grafana: http://localhost:3000 (admin/admin)"
echo "Prometheus: http://localhost:9090"
