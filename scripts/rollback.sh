#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Rollback Script
# Usage: ./rollback.sh <service-name> [revision]

SERVICE_NAME="${1:-}"
REVISION="${2:-0}"

if [[ -z "$SERVICE_NAME" ]]; then
  echo "Usage: $0 <service-name> [revision]"
  echo "Example: $0 crm-service 2"
  exit 1
fi

echo "=== Rolling back $SERVICE_NAME ==="

# Check rollout history
echo "Rollout history:"
kubectl rollout history deployment/$SERVICE_NAME -n nexus

# Perform rollback
if [[ "$REVISION" == "0" ]]; then
  echo "Rolling back to previous version..."
  kubectl rollout undo deployment/$SERVICE_NAME -n nexus
else
  echo "Rolling back to revision $REVISION..."
  kubectl rollout undo deployment/$SERVICE_NAME -n nexus --to-revision=$REVISION
fi

# Wait for rollback to complete
kubectl rollout status deployment/$SERVICE_NAME -n nexus --timeout=300s

echo "✅ Rollback complete"
