#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Blue-Green Switch Script

echo "=== Blue-Green Switch ==="

# Get current active color
CURRENT_COLOR=$(kubectl get service nexus-crm-active -n nexus -o jsonpath='{.spec.selector.version}')
NEW_COLOR=$([ "$CURRENT_COLOR" = "blue" ] && echo "green" || echo "blue")

echo "Current active: $CURRENT_COLOR"
echo "Switching to: $NEW_COLOR"

# Update service selector
kubectl patch service nexus-crm-active -n nexus -p "{\"spec\":{\"selector\":{\"version\":\"$NEW_COLOR\"}}}"

# Verify
sleep 5
NEW_ACTIVE=$(kubectl get service nexus-crm-active -n nexus -o jsonpath='{.spec.selector.version}')
echo "New active: $NEW_ACTIVE"

if [[ "$NEW_ACTIVE" == "$NEW_COLOR" ]]; then
  echo "✅ Switch successful"
else
  echo "❌ Switch failed"
  exit 1
fi
