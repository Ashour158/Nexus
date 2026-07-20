#!/bin/bash
# READ-ONLY. Checks whether the two money-path defects have already produced
# duplicate rows in production, which determines whether the uniqueness
# constraints can be added directly or need reconciliation first.
#
#   Defect #2 (billing): two Payments sharing one stripePaymentIntentId = a
#                         retried payment recorded twice.
#   Defect #3 (finance):  two Invoices sharing one orderId = an order invoiced
#                         twice, money moved twice.
#
# No writes. Runs SELECT ... GROUP BY ... HAVING count(*) > 1 only.
set -uo pipefail

# Go THROUGH pgbouncer (the app path), not direct to the managed PG. A direct
# :25060 connection consumes a raw managed-PG slot, and those are near capacity;
# pgbouncer multiplexes, so a read-only SELECT rides the pool the services
# already use without adding pressure. Take the container's env URL AS-IS (it
# already points at pgbouncer:6432) and only swap the database name.
BASE=$(docker exec nexus-billing sh -c 'echo "${BILLING_DATABASE_URL:-$DATABASE_URL}"')
PREFIX=${BASE%%\?*}; PREFIX=${PREFIX%/*}   # strip query + db-name, keep user@pgbouncer:6432

run() {  # $1 = db name, $2 = sql — psql runs from nexus-postgres, on the compose network
  docker exec -e U="${PREFIX}/$1" nexus-postgres \
    sh -c 'psql "$U" -tA -c "$0"' "$2"
}

echo "=== Defect #2: duplicate Payments (same stripePaymentIntentId per tenant) ==="
run nexus_billing '
  SELECT count(*) AS dup_groups,
         coalesce(sum(c) FILTER (WHERE c > 1), 0) AS extra_rows
  FROM (
    SELECT count(*) AS c
    FROM "Payment"
    WHERE "stripePaymentIntentId" IS NOT NULL
    GROUP BY "tenantId", "stripePaymentIntentId"
    HAVING count(*) > 1
  ) g;'
echo "   (dup_groups = intent ids with >1 payment; 0 means safe to add UNIQUE)"

echo
echo "=== Defect #3: duplicate Invoices per order (same orderId per tenant) ==="
run nexus_finance '
  SELECT count(*) AS dup_groups
  FROM (
    SELECT count(*) AS c
    FROM "Invoice"
    WHERE "orderId" IS NOT NULL
    GROUP BY "tenantId", "orderId"
    HAVING count(*) > 1
  ) g;'
echo "   (dup_groups = orders with >1 invoice; 0 means safe to add UNIQUE)"

echo
echo "=== context: table sizes ==="
run nexus_billing 'SELECT count(*) AS payments, count("stripePaymentIntentId") AS with_intent FROM "Payment";'
run nexus_finance 'SELECT count(*) AS invoices, count("orderId") AS with_order FROM "Invoice";'
echo "CHECK DONE"
