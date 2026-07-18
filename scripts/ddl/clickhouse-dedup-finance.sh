#!/usr/bin/env sh
# Dedup the finance read-model rows duplicated by the finance dual-write bug.
#
# BACKGROUND
# `emitCommercialEvent` used to write an outbox row AND direct-publish the same
# event. Both reached Kafka with DIFFERENT eventIds, so the consumer's
# idempotency store could not collapse them and every commercial event was
# projected TWICE. Any SUM() of money in the read model was therefore exactly 2x
# reality. The publish side is fixed (commit 1933999) — one action now emits one
# event, verified by offset delta — but that fix does not retroactively clean
# rows already written. This script cleans them.
#
# Replaying from Kafka does NOT fix this: the duplicates are in the topic itself.
#
# WHY THIS IS SAFE
# Measured on the live data before writing this script:
#   quote_events : 14 duplicate groups, 14 rows to remove, widest span   6 ms
#   order_events :  4 duplicate groups,  4 rows to remove, widest span   6 ms
#   invoice_events: 0 (invoices publish via a different path — already clean)
# Every duplicate pair is 3-6 ms apart, which is the outbox copy and the direct
# publish. A LEGITIMATE repeat (a real re-send) is seconds-to-hours apart, never
# milliseconds. The script therefore ABORTS if it finds any duplicate group
# spanning more than SPAN_GUARD_MS, because that would mean the data no longer
# matches the assumption this dedup rule is built on.
#
# REVERSIBLE
# The original table is RENAMED to <table>_predup_backup rather than dropped.
# To roll back:  RENAME TABLE default.<t> TO default.<t>_bad,
#                       default.<t>_predup_backup TO default.<t>;
#
# USAGE (on the droplet, from /opt/nexus):
#   sh scripts/ddl/clickhouse-dedup-finance.sh          # dry run, prints only
#   APPLY=1 sh scripts/ddl/clickhouse-dedup-finance.sh  # actually mutates
set -eu

SPAN_GUARD_MS="${SPAN_GUARD_MS:-1000}"
APPLY="${APPLY:-0}"

ch() {
  docker compose exec -T clickhouse clickhouse-client --query "$1" 2>&1 | tr -d '\r'
}

# table:identity_column — the columns that, with event_type, identify "the same
# business event". Money is intentionally NOT part of the key: a corrected
# re-emission with a different amount is a genuinely different event.
TARGETS="quote_events:quote_id order_events:order_id invoice_events:invoice_id"

echo "== finance read-model dedup =="
echo "   span guard: ${SPAN_GUARD_MS} ms    apply: ${APPLY}"
echo ""

for pair in $TARGETS; do
  T="${pair%%:*}"
  IDCOL="${pair##*:}"

  BEFORE="$(ch "SELECT count() FROM default.${T}")"

  # Guard: refuse to run if any duplicate group is wider than the guard window,
  # i.e. if something that is NOT the dual-write bug is producing repeats.
  WIDEST="$(ch "SELECT ifNull(max(sp), 0) FROM (
      SELECT dateDiff('millisecond', min(occurred_at), max(occurred_at)) AS sp
      FROM default.${T}
      WHERE notEmpty(${IDCOL})
      GROUP BY tenant_id, ${IDCOL}, event_type
      HAVING count() > 1)")"

  DUPES="$(ch "SELECT ifNull(sum(n) - count(), 0) FROM (
      SELECT count() AS n FROM default.${T}
      WHERE notEmpty(${IDCOL})
      GROUP BY tenant_id, ${IDCOL}, event_type
      HAVING n > 1)")"

  printf '%-16s rows=%-6s dupes=%-4s widest_span=%sms\n' "$T" "$BEFORE" "$DUPES" "$WIDEST"

  if [ "${DUPES:-0}" -eq 0 ]; then
    echo "                 nothing to do"
    continue
  fi

  if [ "${WIDEST:-0}" -gt "$SPAN_GUARD_MS" ]; then
    echo "  ABORT: a duplicate group spans ${WIDEST}ms (> ${SPAN_GUARD_MS}ms)."
    echo "  That is wider than the dual-write signature, so these may be LEGITIMATE"
    echo "  repeat events. Refusing to delete. Investigate before re-running."
    exit 1
  fi

  if [ "$APPLY" != "1" ]; then
    echo "                 would remove ${DUPES} row(s)  (dry run)"
    continue
  fi

  # Rebuild deduped. `LIMIT 1 BY` keeps the first row per group after ORDER BY,
  # preserving every column of the surviving row (not just the group keys).
  ch "CREATE TABLE IF NOT EXISTS default.${T}_dedup_tmp AS default.${T}" >/dev/null
  ch "TRUNCATE TABLE default.${T}_dedup_tmp" >/dev/null
  ch "INSERT INTO default.${T}_dedup_tmp
        SELECT * FROM default.${T}
        ORDER BY occurred_at
        LIMIT 1 BY tenant_id, ${IDCOL}, event_type" >/dev/null

  AFTER="$(ch "SELECT count() FROM default.${T}_dedup_tmp")"
  EXPECTED=$((BEFORE - DUPES))
  if [ "$AFTER" -ne "$EXPECTED" ]; then
    echo "  ABORT: deduped table has ${AFTER} rows, expected ${EXPECTED}. Not swapping."
    exit 1
  fi

  # Keep the original as a backup rather than dropping it — this is reversible.
  ch "RENAME TABLE default.${T} TO default.${T}_predup_backup,
                   default.${T}_dedup_tmp TO default.${T}" >/dev/null
  echo "                 removed ${DUPES} row(s) -> ${AFTER}  (backup: ${T}_predup_backup)"
done

echo ""
echo "Done. Verify a money figure against Postgres before trusting reports."
