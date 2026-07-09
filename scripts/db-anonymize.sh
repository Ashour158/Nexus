#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Database Anonymization Script

echo "=== Anonymizing Database ==="

# Anonymize user emails
psql -U nexus -d nexus -c "
UPDATE users SET email = 'user_' || id || '@anonymized.local';
UPDATE contacts SET email = 'contact_' || id || '@anonymized.local';
UPDATE contacts SET phone = '555-0000';
"

echo "✅ Database anonymized"
