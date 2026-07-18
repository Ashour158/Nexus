#!/bin/sh
set -eu

# Nexus CRM — rollback the production compose stack to the last release that
# completed smoke testing. Refuses to guess when no known-good state exists.

COMPOSE_DIR="${NEXUS_DIR:-/opt/nexus}"
STATE_FILE="${NEXUS_STATE_FILE:-$COMPOSE_DIR/.nexus-last-good}"
RELEASES_FILE="${NEXUS_RELEASES_FILE:-$COMPOSE_DIR/releases.log}"

cd "$COMPOSE_DIR"

compose() {
  docker compose \
    -f "$COMPOSE_DIR/docker-compose.yml" \
    -f "$COMPOSE_DIR/docker-compose.prod.yml" \
    "$@"
}

record_good() {
  tag="${IMAGE_TAG:-}"
  commit="${GIT_SHA:-}"
  built_at="${BUILT_AT:-unknown}"
  registry="${REGISTRY:-ghcr.io}"
  owner="${GHCR_OWNER:-nexus-crm}"
  recorded_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [ -z "$tag" ] && [ -z "$commit" ]; then
    echo "❌ Refusing to record a release without IMAGE_TAG or GIT_SHA." >&2
    exit 1
  fi
  case "$tag" in
    *[!A-Za-z0-9._-]*)
      echo "❌ Invalid IMAGE_TAG '$tag'." >&2
      exit 1
      ;;
  esac
  case "$commit" in
    *[!A-Fa-f0-9]*)
      echo "❌ Invalid GIT_SHA '$commit'." >&2
      exit 1
      ;;
  esac
  case "$registry" in
    ''|*[!A-Za-z0-9._:/-]*)
      echo "❌ Invalid REGISTRY '$registry'." >&2
      exit 1
      ;;
  esac
  case "$owner" in
    ''|*[!A-Za-z0-9._/-]*)
      echo "❌ Invalid GHCR_OWNER '$owner'." >&2
      exit 1
      ;;
  esac

  umask 077
  tmp_state="${STATE_FILE}.tmp.$$"
  trap 'rm -f "$tmp_state"' 0 1 2 15
  {
    printf 'IMAGE_TAG=%s\n' "$tag"
    printf 'COMMIT=%s\n' "$commit"
    printf 'BUILT_AT=%s\n' "$built_at"
    printf 'REGISTRY=%s\n' "$registry"
    printf 'GHCR_OWNER=%s\n' "$owner"
    printf 'RECORDED_AT=%s\n' "$recorded_at"
  } > "$tmp_state"
  mv "$tmp_state" "$STATE_FILE"
  trap - 0 1 2 15

  printf '%s\t%s/%s\t%s\t%s\t%s\n' \
    "$recorded_at" "$registry" "$owner" "$tag" "$commit" "$built_at" >> "$RELEASES_FILE"
  echo "✅ Recorded known-good deploy $registry/$owner:$tag at $recorded_at"
}

if [ "${1:-}" = "record" ]; then
  record_good
  exit 0
fi

if [ ! -f "$STATE_FILE" ]; then
  echo "❌ No known-good deploy recorded at $STATE_FILE." >&2
  echo "   Run './rollback.sh record' after a verified deploy. Refusing to guess." >&2
  exit 1
fi

IMAGE_TAG="$(sed -n 's/^IMAGE_TAG=//p' "$STATE_FILE" | head -n 1)"
COMMIT="$(sed -n 's/^COMMIT=//p' "$STATE_FILE" | head -n 1)"
BUILT_AT="$(sed -n 's/^BUILT_AT=//p' "$STATE_FILE" | head -n 1)"
REGISTRY="$(sed -n 's/^REGISTRY=//p' "$STATE_FILE" | head -n 1)"
GHCR_OWNER="$(sed -n 's/^GHCR_OWNER=//p' "$STATE_FILE" | head -n 1)"
RECORDED_AT="$(sed -n 's/^RECORDED_AT=//p' "$STATE_FILE" | head -n 1)"

REGISTRY="${REGISTRY:-ghcr.io}"
GHCR_OWNER="${GHCR_OWNER:-nexus-crm}"

case "$IMAGE_TAG" in
  *[!A-Za-z0-9._-]*)
    echo "❌ Recorded IMAGE_TAG is invalid. Refusing to proceed." >&2
    exit 1
    ;;
esac
case "$COMMIT" in
  *[!A-Fa-f0-9]*)
    echo "❌ Recorded COMMIT is invalid. Refusing to proceed." >&2
    exit 1
    ;;
esac
case "$REGISTRY" in
  ''|*[!A-Za-z0-9._:/-]*)
    echo "❌ Recorded REGISTRY is invalid. Refusing to proceed." >&2
    exit 1
    ;;
esac
case "$GHCR_OWNER" in
  ''|*[!A-Za-z0-9._/-]*)
    echo "❌ Recorded GHCR_OWNER is invalid. Refusing to proceed." >&2
    exit 1
    ;;
esac

echo "=== Rolling back to last known-good ==="
echo "  IMAGE_TAG=${IMAGE_TAG:-<none>}  COMMIT=${COMMIT:-<none>}  recorded=${RECORDED_AT:-?}"

if [ -n "$IMAGE_TAG" ]; then
  export IMAGE_TAG REGISTRY GHCR_OWNER
  export GIT_SHA="${COMMIT:-$IMAGE_TAG}"
  export BUILT_AT="${BUILT_AT:-unknown}"
  echo "→ restoring image tag $IMAGE_TAG"
  if [ "$#" -eq 0 ]; then
    compose pull || true
    compose up -d --force-recreate
  else
    compose pull "$@" || true
    compose up -d --force-recreate --no-deps "$@"
  fi
elif [ -n "$COMMIT" ]; then
  if [ "$#" -eq 0 ]; then
    echo "❌ Build-on-host rollback needs explicit service names." >&2
    exit 1
  fi
  echo "→ restoring commit $COMMIT (rebuild required)"
  git fetch --all --quiet || true
  git reset --hard "$COMMIT"
  for svc in "$@"; do
    echo "  building $svc ..."
    compose build "$svc"
  done
  compose up -d --force-recreate --no-deps "$@"
else
  echo "❌ State file has neither IMAGE_TAG nor COMMIT. Refusing to proceed." >&2
  exit 1
fi

echo "=== Verifying health ==="
sleep 8
if [ -x scripts/health-check.sh ]; then
  sh scripts/health-check.sh
else
  compose ps
fi

echo "✅ Rollback complete"
