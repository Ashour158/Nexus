#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — API Diff Script

echo "=== API Diff ==="

if ! command -v openapi-diff &> /dev/null; then
  echo "⚠️ openapi-diff not installed. Install with: npm install -g openapi-diff"
  exit 1
fi

OLD_SPEC="${1:-docs/openapi/old.json}"
NEW_SPEC="${2:-docs/openapi/new.json}"

openapi-diff "$OLD_SPEC" "$NEW_SPEC" --html docs/openapi/diff.html || true

echo "✅ API diff generated: docs/openapi/diff.html"
