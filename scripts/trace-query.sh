#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Trace Query Script

echo "=== Trace Query ==="

TRACE_ID="${1:-}"

if [[ -z "$TRACE_ID" ]]; then
  echo "Usage: $0 <trace-id>"
  exit 1
fi

# Query Jaeger
JAEGER_URL="http://localhost:16686"

if kubectl port-forward -n nexus-monitoring svc/jaeger 16686:16686 &> /dev/null & then
  sleep 2
  curl -s "$JAEGER_URL/api/traces/$TRACE_ID" | jq '.'
  kill %1
else
  echo "⚠️ Could not port-forward to Jaeger"
fi
