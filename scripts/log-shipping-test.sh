#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Log Shipping Test

echo "=== Log Shipping Test ==="

# Generate test logs
kubectl run -n nexus --rm -i --restart=Never log-test --image=busybox:1.36 -- sh -c '
  for i in $(seq 1 100); do
    echo "{"level":"info","msg":"Test log entry $i","timestamp":"$(date -Iseconds)"}"
    sleep 0.1
  done
'

# Query Loki for test logs
sleep 5
LOKI_URL="http://localhost:3100"

if kubectl port-forward -n nexus-monitoring svc/loki 3100:3100 &> /dev/null & then
  sleep 2
  COUNT=$(curl -s "$LOKI_URL/loki/api/v1/query_range?query=%7Bjob%3D%22fluent-bit%22%7D&limit=100" | jq '.data.result | length')
  echo "Found $COUNT log streams"
  kill %1
else
  echo "⚠️ Could not port-forward to Loki"
fi
