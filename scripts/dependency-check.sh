#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — OWASP Dependency Check

echo "=== OWASP Dependency Check ==="

if ! command -v dependency-check.sh &> /dev/null; then
  echo "⚠️ OWASP Dependency Check not installed"
  echo "Download from: https://owasp.org/www-project-dependency-check/"
  exit 1
fi

# Run check
dependency-check.sh \
  --project "Nexus CRM" \
  --scan . \
  --format HTML \
  --format JSON \
  --out reports/dependency-check \
  --enableExperimental

echo "✅ Dependency check complete. Report: reports/dependency-check/dependency-check-report.html"
