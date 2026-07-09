#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Feature Flags Management Script
# Usage: ./feature-flags.sh <action> <flag-name> [value]

ACTION="${1:-}"
FLAG_NAME="${2:-}"
VALUE="${3:-}"

if [[ -z "$ACTION" || -z "$FLAG_NAME" ]]; then
  echo "Usage: $0 <get|set|delete> <flag-name> [value]"
  exit 1
fi

echo "=== Feature Flags ==="

case "$ACTION" in
  get)
    REDIS_URL=$(kubectl get secret nexus-redis -n nexus -o jsonpath='{.data.url}' | base64 -d)
    redis-cli -u "$REDIS_URL" GET "feature:$FLAG_NAME"
    ;;
  set)
    if [[ -z "$VALUE" ]]; then
      echo "Value required for set"
      exit 1
    fi
    REDIS_URL=$(kubectl get secret nexus-redis -n nexus -o jsonpath='{.data.url}' | base64 -d)
    redis-cli -u "$REDIS_URL" SET "feature:$FLAG_NAME" "$VALUE"
    echo "✅ Set $FLAG_NAME = $VALUE"
    ;;
  delete)
    REDIS_URL=$(kubectl get secret nexus-redis -n nexus -o jsonpath='{.data.url}' | base64 -d)
    redis-cli -u "$REDIS_URL" DEL "feature:$FLAG_NAME"
    echo "✅ Deleted $FLAG_NAME"
    ;;
  *)
    echo "Unknown action: $ACTION"
    exit 1
    ;;
esac
