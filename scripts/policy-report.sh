#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Policy Report

echo "=== Policy Report ==="

# Get policy reports
kubectl get policyreport -A

# Get constraint violations
kubectl get constraints -o yaml | grep -A 5 "violations" || true

echo "✅ Policy report complete"
