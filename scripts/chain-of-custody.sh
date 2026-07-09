#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Chain of Custody Log

echo "=== Chain of Custody ==="

INCIDENT_ID="${1:-$(date +%Y%m%d-%H%M%S)}"
LOG_FILE="evidence/$INCIDENT_ID/chain-of-custody.log"

mkdir -p "evidence/$INCIDENT_ID"

cat >> "$LOG_FILE" <<EOF
Chain of Custody Log
====================
Incident ID: $INCIDENT_ID
Date: $(date)
Collected by: $(whoami)
Hostname: $(hostname)

EOF

echo "✅ Chain of custody log created: $LOG_FILE"
