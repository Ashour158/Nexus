#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Metrics Export Script

echo "=== Metrics Export ==="

START="${1:-$(date -d '1 hour ago' +%s)}"
END="${2:-$(date +%s)}"

PROMETHEUS_URL="http://localhost:9090"

if kubectl port-forward -n nexus-monitoring svc/prometheus 9090:9090 &> /dev/null & then
  sleep 2
  
  # Export metrics
  curl -s "$PROMETHEUS_URL/api/v1/query_range?query=up&start=$START&end=$END&step=15" > metrics-up.json
  curl -s "$PROMETHEUS_URL/api/v1/query_range?query=http_requests_total&start=$START&end=$END&step=15" > metrics-requests.json
  
  echo "✅ Metrics exported to metrics-*.json"
  kill %1
else
  echo "⚠️ Could not port-forward to Prometheus"
fi
