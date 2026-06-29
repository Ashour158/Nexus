#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Consul Intentions Setup

echo "=== Setting up Consul Intentions ==="

# Allow communication between services
cat <<EOF | consul config write -
Kind = "service-intentions"
Name = "postgres"
Sources = [
  {
    Name = "nexus-crm"
    Action = "allow"
  }
]
EOF

cat <<EOF | consul config write -
Kind = "service-intentions"
Name = "redis"
Sources = [
  {
    Name = "nexus-crm"
    Action = "allow"
  }
]
EOF

echo "✅ Consul intentions set"
