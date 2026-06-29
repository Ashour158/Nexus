#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Log Query Script

echo "=== Log Query ==="

QUERY="${1:-{namespace=\"nexus\"}}"

# Query Loki
LOKI_URL="http://localhost:3100"

if kubectl port-forward -n nexus-monitoring svc/loki 3100:3100 &> /dev/null & then
  sleep 2
  curl -s "$LOKI_URL/loki/api/v1/query_range?query=$QUERY" | jq '.data.result'
  kill %1
else
  echo "⚠️ Could not port-forward to Loki"
fi
