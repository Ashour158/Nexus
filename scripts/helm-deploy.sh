#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Helm Deployment Script
# Usage: ./helm-deploy.sh [environment]

ENVIRONMENT="${1:-staging}"

echo "=== Helm Deploy to $ENVIRONMENT ==="

helm upgrade --install nexus-crm infrastructure/helm/nexus-crm \
  --namespace nexus \
  --create-namespace \
  --values infrastructure/helm/nexus-crm/values-$ENVIRONMENT.yaml \
  --wait \
  --timeout 10m

echo "✅ Helm deploy complete"
