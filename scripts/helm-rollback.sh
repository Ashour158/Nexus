#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Helm Rollback Script
# Usage: ./helm-rollback.sh [revision]

REVISION="${1:-0}"

echo "=== Helm Rollback ==="

if [[ "$REVISION" == "0" ]]; then
  helm rollback nexus-crm -n nexus
else
  helm rollback nexus-crm "$REVISION" -n nexus
fi

echo "✅ Helm rollback complete"
