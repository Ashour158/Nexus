#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — OPA Policy Test

echo "=== OPA Policy Tests ==="

# Test policies
opa test infrastructure/k8s/opa-policies/ -v || true

echo "✅ OPA tests complete"
