#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — SSL Certificate Check Script

echo "=== SSL Certificate Check ==="

DOMAINS=(
  "app.nexus-crm.io:443"
  "api.nexus-crm.io:443"
)

for domain in "${DOMAINS[@]}"; do
  echo -n "$domain: "
  EXPIRY=$(echo | openssl s_client -servername "${domain%%:*}" -connect "$domain" 2>/dev/null | openssl x509 -noout -dates | grep notAfter | cut -d= -f2)
  if [[ -n "$EXPIRY" ]]; then
    echo "✅ Expires: $EXPIRY"
  else
    echo "❌ Could not retrieve certificate"
  fi
done
