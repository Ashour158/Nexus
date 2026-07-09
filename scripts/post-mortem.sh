#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Post-Mortem Template Generator

echo "=== Post-Mortem Template ==="

INCIDENT_ID="${1:-$(date +%Y%m%d-%H%M%S)}"

cat > "incidents/$INCIDENT_ID/post-mortem.md" <<EOF
# Post-Mortem: Incident $INCIDENT_ID

## Summary
- **Date**: $(date)
- **Duration**: TBD
- **Severity**: TBD
- **Impact**: TBD

## Timeline
- TBD

## Root Cause
TBD

## Resolution
TBD

## Lessons Learned
TBD

## Action Items
- [ ] TBD

## Attachments
- logs.txt
- events.txt
- pods.yaml
- metrics.txt
- network.yaml
EOF

echo "✅ Post-mortem template created: incidents/$INCIDENT_ID/post-mortem.md"
