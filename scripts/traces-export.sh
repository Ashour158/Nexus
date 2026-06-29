#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Traces Export Script

echo "=== Traces Export ==="

TRACE_ID="${1:-}"

if [[ -z "$TRACE_ID" ]]; then
  echo "Usage: $0 <trace-id>"
  exit 1
fi

JAEGER_URL="http://localhost:16686"

if kubectl port-forward -n nexus-monitoring svc/jaeger 16686:16686 &> /dev/null & then
  sleep 2
  curl -s "$JAEGER_URL/api/traces/$TRACE_ID" > "trace-$TRACE_ID.json"
  echo "✅ Trace exported to trace-$TRACE_ID.json"
  kill %1
else
  echo "⚠️ Could not port-forward to Jaeger"
fi
