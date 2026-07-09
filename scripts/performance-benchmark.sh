#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Performance Benchmark Script
# Usage: ./performance-benchmark.sh [endpoint]

ENDPOINT="${1:-http://localhost:3001/health}"
DURATION="${2:-30}"
CONNECTIONS="${3:-100}"

echo "=== Nexus CRM Performance Benchmark ==="
echo "Endpoint: $ENDPOINT"
echo "Duration: ${DURATION}s"
echo "Connections: $CONNECTIONS"

if command -v wrk &> /dev/null; then
  wrk -t12 -c$CONNECTIONS -d${DURATION}s "$ENDPOINT"
elif command -v hey &> /dev/null; then
  hey -z ${DURATION}s -c $CONNECTIONS "$ENDPOINT"
else
  echo "⚠️ Neither wrk nor hey installed. Using basic curl loop..."
  for i in $(seq 1 $CONNECTIONS); do
    curl -s -o /dev/null -w "%{http_code} %{time_total}\n" "$ENDPOINT" &
  done
  wait
fi

echo "✅ Benchmark complete"
