#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Local Kubernetes Setup (kind/minikube)
# Usage: ./setup-local-k8s.sh

echo "=== Nexus CRM Local K8s Setup ==="

# Create namespace
kubectl apply -f infrastructure/k8s/namespace.yaml

# Apply configs and secrets
kubectl apply -f infrastructure/k8s/configmap.yaml
kubectl apply -f infrastructure/k8s/secrets.yaml

# Apply core infrastructure
kubectl apply -f infrastructure/k8s/otel-collector.yaml
kubectl apply -f infrastructure/k8s/clickhouse-deployment.yaml
kubectl apply -f infrastructure/k8s/meilisearch-deployment.yaml
kubectl apply -f infrastructure/k8s/minio-deployment.yaml

# Apply networking
kubectl apply -f infrastructure/k8s/network-policy.yaml
kubectl apply -f infrastructure/k8s/pod-disruption-budget.yaml

# Apply RBAC
kubectl apply -f infrastructure/k8s/service-account.yaml
kubectl apply -f infrastructure/k8s/rbac.yaml

# Apply cronjobs
kubectl apply -f infrastructure/k8s/cronjob-outbox-relay.yaml
kubectl apply -f infrastructure/k8s/cronjob-jwt-rotation.yaml
kubectl apply -f infrastructure/k8s/cronjob-backup-verify.yaml

echo "✅ Local K8s setup complete"
echo "Run 'kubectl get pods -n nexus' to verify"
