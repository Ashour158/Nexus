#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Evidence Preservation Script

echo "=== Evidence Preservation ==="

INCIDENT_ID="${1:-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "evidence/$INCIDENT_ID"

echo "Incident ID: $INCIDENT_ID"

# Create tar archive of forensics data
if [[ -d "forensics/$INCIDENT_ID" ]]; then
  tar -czf "evidence/$INCIDENT_ID/forensics.tar.gz" -C forensics "$INCIDENT_ID"
fi

# Hash all files
find "evidence/$INCIDENT_ID" -type f -exec sha256sum {} \; > "evidence/$INCIDENT_ID/hashes.txt"

# Sign evidence
gpg --detach-sign "evidence/$INCIDENT_ID/hashes.txt"

echo "✅ Evidence preserved: evidence/$INCIDENT_ID/"
