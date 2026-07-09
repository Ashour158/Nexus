#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Metric Query Script

echo "=== Metric Query ==="

QUERY="${1:-up}"

# Query Prometheus
PROMETHEUS_URL="http://localhost:9090"

if kubectl port-forward -n nexus-monitoring svc/prometheus 9090:9090 &> /dev/null & then
  sleep 2
  curl -s "$PROMETHEUS_URL/api/v1/query?query=$QUERY" | jq '.data.result'
  kill %1
else
  echo "⚠️ Could not port-forward to Prometheus"
fi
