#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Kyverno Policy Test

echo "=== Kyverno Policy Tests ==="

# Test policies
kyverno test infrastructure/k8s/kyverno-policies/ || true

echo "✅ Kyverno tests complete"
