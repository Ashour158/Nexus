#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — DNS Check Script

echo "=== DNS Check ==="

DOMAINS=(
  "app.nexus-crm.io"
  "api.nexus-crm.io"
  "grafana.nexus-crm.io"
  "prometheus.nexus-crm.io"
)

for domain in "${DOMAINS[@]}"; do
  echo -n "$domain: "
  if nslookup "$domain" > /dev/null 2>&1; then
    IP=$(nslookup "$domain" | awk '/^Address: / { print $2 }' | tail -1)
    echo "✅ $IP"
  else
    echo "❌ Not resolving"
  fi
done
