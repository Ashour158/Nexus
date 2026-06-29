#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Load Test Runner

echo "=== Running Load Tests ==="

# Start k6 if available
if command -v k6 &> /dev/null; then
  k6 run tests/load/smoke-test.js
  k6 run tests/load/stress-test.js
  k6 run tests/load/spike-test.js
  k6 run tests/load/soak-test.js
else
  echo "⚠️ k6 not installed. Install from https://k6.io/docs/get-started/installation/"
  exit 1
fi

echo "✅ Load tests complete"
