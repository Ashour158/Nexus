#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Observability Dashboard Setup

echo "=== Observability Dashboard ==="

# Port forward all services
kubectl port-forward -n nexus-monitoring svc/grafana 3000:3000 &
GRAFANA_PID=$!

kubectl port-forward -n nexus-monitoring svc/prometheus 9090:9090 &
PROMETHEUS_PID=$!

kubectl port-forward -n nexus-monitoring svc/jaeger 16686:16686 &
JAEGER_PID=$!

kubectl port-forward -n nexus-monitoring svc/loki 3100:3100 &
LOKI_PID=$!

echo "✅ Observability services available:"
echo "  Grafana:    http://localhost:3000"
echo "  Prometheus: http://localhost:9090"
echo "  Jaeger:     http://localhost:16686"
echo "  Loki:       http://localhost:3100"
echo ""
echo "Press Ctrl+C to stop"

wait
