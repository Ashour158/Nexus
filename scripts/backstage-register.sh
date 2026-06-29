#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Backstage Registration Script

echo "=== Registering with Backstage ==="

BACKSTAGE_URL="${BACKSTAGE_URL:-https://backstage.nexus-crm.io}"

# Register catalog entities
curl -X POST "$BACKSTAGE_URL/api/catalog/locations" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "url",
    "target": "https://raw.githubusercontent.com/nexus-crm/nexus-crm/main/infrastructure/k8s/backstage-catalog.yaml"
  }'

echo "✅ Registered with Backstage"
