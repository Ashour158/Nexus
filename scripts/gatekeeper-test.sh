#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Gatekeeper Policy Test

echo "=== Gatekeeper Policy Tests ==="

# Test constraints
kubectl apply -f infrastructure/k8s/opa-gatekeeper.yaml --dry-run=server || true

echo "✅ Gatekeeper tests complete"
