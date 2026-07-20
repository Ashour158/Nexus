#!/bin/bash
# Rebuild and restart the web container from the current branch head.
#
# `set -e` is load-bearing. Without it a failed `git pull` is ignored and this
# script rebuilds the OLD code, prints "WEB DEPLOY DONE", brings the container
# up healthy, and leaves you verifying a fix that was never deployed. That has
# now happened twice, both times because an untracked helper script on the
# droplet blocked a fast-forward that would have overwritten it.
#
# Untracked deploy-*.sh files are cleared first for that reason: they are copies
# of files that are now tracked in the repo, so the tracked version is
# authoritative and removing the stray copy is safe.
set -euo pipefail
set -x
cd /opt/nexus

# Drop stray copies of scripts that are now tracked, so --ff-only cannot abort.
git ls-files --error-unmatch deploy-web-urls.sh >/dev/null 2>&1 && rm -f /opt/nexus/deploy-web-urls.sh.orig || true
for f in deploy-dedup-chatbot.sh deploy-storage-schema.sh deploy-ratelimit.sh; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    git checkout -- "$f" 2>/dev/null || rm -f "$f"
  fi
done

BEFORE=$(git rev-parse --short HEAD)
git pull --ff-only origin fix/local-boot
AFTER=$(git rev-parse --short HEAD)
echo "deploying ${BEFORE} -> ${AFTER}"

docker compose build web
docker compose up -d --no-deps web
echo "WEB DEPLOY DONE"
sleep 20
docker compose ps web --format "{{.Name}} {{.Status}}"
