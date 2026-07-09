#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Full Monitoring Stack Setup

echo "=== Monitoring Stack Setup ==="

# Install Loki
kubectl apply -f infrastructure/k8s/loki-logging.yaml

# Install Promtail
kubectl apply -f infrastructure/k8s/promtail.yaml

# Install Tempo
kubectl apply -f infrastructure/k8s/tempo.yaml

# Install Thanos
kubectl apply -f infrastructure/k8s/thanos.yaml

# Install Jaeger
kubectl apply -f infrastructure/k8s/jaeger-deployment.yaml

echo "✅ Monitoring stack setup complete"
