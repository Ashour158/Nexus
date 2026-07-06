#!/usr/bin/env bash
#
# Nexus health check — polls every service's /health over the internal docker
# network (via the crm container) and exits non-zero if any is unhealthy.
# Optional: set HEALTHCHECK_WEBHOOK to POST a summary to Slack/Discord on failure.
#
# Cron (every 5 min):  */5 * * * * bash /opt/nexus/scripts/healthcheck.sh >> /var/log/nexus-health.log 2>&1
set -uo pipefail

EXEC_CONTAINER="${EXEC_CONTAINER:-nexus-crm}"

RESULT="$(docker exec "$EXEC_CONTAINER" node -e '
const svc = {
  "auth-service":3000,"crm-service":3001,"finance-service":3002,"notification-service":3003,
  "metadata-service":3004,"realtime-service":3005,"search-service":3006,"workflow-service":3007,
  "analytics-service":3008,"comm-service":3009,"storage-service":3010,"integration-service":3012,
  "blueprint-service":3013,"approval-service":3014,"data-service":3015,"document-service":3016,
  "chatbot-service":3017,"cadence-service":3018,"territory-service":3019,"planning-service":3020,
  "reporting-service":3021,"portal-service":3022,"knowledge-service":3023,"incentive-service":3024,
  "email-sync-service":3026,"accounts-service":3031,"notes-service":3032,"contacts-service":3041,
  "activities-service":3043
};
(async () => {
  const down = [];
  await Promise.all(Object.entries(svc).map(async ([n, p]) => {
    try {
      const r = await fetch(`http://${n}:${p}/health`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) down.push(`${n}:${r.status}`);
    } catch { down.push(`${n}:ERR`); }
  }));
  const total = Object.keys(svc).length;
  if (down.length) console.log(`DOWN (${down.length}/${total}): ${down.join(", ")}`);
  else console.log(`ALL HEALTHY (${total}/${total})`);
  process.exit(down.length ? 1 : 0);
})();
')"
STATUS=$?

echo "$(date -u +%FT%TZ) $RESULT"

if [ "$STATUS" -ne 0 ] && [ -n "${HEALTHCHECK_WEBHOOK:-}" ]; then
  curl -sf -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"🚨 Nexus health: $RESULT\"}" "$HEALTHCHECK_WEBHOOK" >/dev/null || true
fi

exit "$STATUS"
