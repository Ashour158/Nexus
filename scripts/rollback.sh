#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Rollback (docker-compose).
#
# Production runs docker-compose, not Kubernetes. The previous version of this
# script called `kubectl rollout undo`, which fails on the compose host; and the
# deploy workflow's "rollback" merely restarted the *same* image tag. Neither
# actually reverted anything. This restores the last recorded known-good deploy.
#
# Supports both deploy models used by this repo:
#   1. registry-tag model  — CI (.github/workflows/deploy.yml) pulls ${IMAGE_TAG}
#   2. build-on-host model — the droplet builds from a git checkout
#
# Usage:
#   ./rollback.sh record                 # after a successful deploy + smoke test
#   ./rollback.sh crm-service web        # roll back these services to last good
#   ./rollback.sh                        # registry-tag model only: whole stack
#
# Refuses to guess: with nothing recorded it exits non-zero rather than
# "rolling back" to an unknown state.

COMPOSE_DIR="${NEXUS_DIR:-/opt/nexus}"
STATE_FILE="${NEXUS_STATE_FILE:-$COMPOSE_DIR/.nexus-last-good}"

cd "$COMPOSE_DIR"

record_good() {
  local tag commit
  tag="${IMAGE_TAG:-}"
  commit="$(git rev-parse HEAD 2>/dev/null || echo '')"
  {
    echo "IMAGE_TAG=${tag}"
    echo "COMMIT=${commit}"
    echo "RECORDED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$STATE_FILE"
  echo "✅ Recorded known-good deploy → $STATE_FILE"
  cat "$STATE_FILE"
}

if [[ "${1:-}" == "record" ]]; then
  record_good
  exit 0
fi

if [[ ! -f "$STATE_FILE" ]]; then
  echo "❌ No known-good deploy recorded at $STATE_FILE." >&2
  echo "   Run './rollback.sh record' after a verified deploy. Refusing to guess." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"
SERVICES=("$@")

echo "=== Rolling back to last known-good ==="
echo "  IMAGE_TAG=${IMAGE_TAG:-<none>}  COMMIT=${COMMIT:-<none>}  recorded=${RECORDED_AT:-?}"

if [[ -n "${IMAGE_TAG:-}" ]]; then
  # Registry-tag model: re-pull and recreate the prior known-good tag.
  export IMAGE_TAG
  echo "→ restoring image tag ${IMAGE_TAG}"
  docker compose pull "${SERVICES[@]}" || true
  docker compose up -d --force-recreate --no-deps "${SERVICES[@]}"
elif [[ -n "${COMMIT:-}" ]]; then
  # Build-on-host model: check out the prior commit and rebuild those services.
  echo "→ restoring commit ${COMMIT} (rebuild required)"
  if [[ ${#SERVICES[@]} -eq 0 ]]; then
    echo "❌ Build-on-host rollback needs explicit service names (rebuilding all is unsafe)." >&2
    echo "   e.g. ./rollback.sh crm-service finance-service" >&2
    exit 1
  fi
  git fetch --all --quiet || true
  git reset --hard "$COMMIT"
  for svc in "${SERVICES[@]}"; do
    echo "  building $svc ..."
    docker compose build "$svc"
  done
  docker compose up -d --force-recreate --no-deps "${SERVICES[@]}"
else
  echo "❌ State file has neither IMAGE_TAG nor COMMIT. Refusing to proceed." >&2
  exit 1
fi

echo "=== Verifying health ==="
sleep 8
if [[ -x scripts/health-check.sh ]]; then
  bash scripts/health-check.sh
else
  docker compose ps
fi

echo "✅ Rollback complete"
