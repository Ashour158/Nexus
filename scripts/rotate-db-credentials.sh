#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Database Credential Rotation Script

echo "=== Rotating Database Credentials ==="

# Rotate Vault credentials
vault write -f database/rotate-role/nexus-crm

echo "✅ Database credentials rotated"
