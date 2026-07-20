#!/bin/bash
# Rebuild the two services changed by the dedup + conversations fix.
# <=2 builds at a time — the droplet is load-fragile.
#
# `set -e` is load-bearing, not boilerplate. Without it a failed `git pull`
# (e.g. aborted because an untracked file would be overwritten) is ignored and
# the script cheerfully rebuilds the OLD code, reports success, and leaves you
# debugging a fix that was never deployed. That happened on the first run of
# this script.
set -euo pipefail
set -x
cd /opt/nexus

BEFORE=$(git rev-parse --short HEAD)
git pull --ff-only origin fix/local-boot
AFTER=$(git rev-parse --short HEAD)
echo "deploying ${BEFORE} -> ${AFTER}"
docker compose build crm-service chatbot-service
docker compose up -d --no-deps crm-service chatbot-service
echo "DEDUP+CHATBOT DEPLOY DONE"
sleep 20
docker compose ps crm-service chatbot-service --format "{{.Name}} {{.Status}}"
