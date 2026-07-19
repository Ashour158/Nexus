# Codex Brief #4 — Make the local gates green (tests + lint)

Repository: work ONLY in `C:\Users\Ahmed Ashour\nexus-codex-4` (git worktree, branch
`chore/gates-repair`, base commit 8200357). Do NOT commit or stage — the orchestrator
reviews and commits.

## Goal

Three gates must pass from the worktree root, with no external infrastructure running
(no Kafka, no Postgres, no Meilisearch, no Redis):

```
pnpm -w test        # currently 23 of 140 files fail
pnpm lint           # currently fails in the new BI chart code
pnpm typecheck      # keep green (64/64) — do not regress it
```

## Known failure classes and the POLICY for each

1. **Decommissioned zombie services** (`services/deals-service`, `services/leads-service`
   — each has a DEPRECATED.md; they are not deployed). Their suites fail on route 404s /
   health checks. Policy: EXCLUDE these services from the workspace test gate (remove
   their test scripts or exclude via the workspace/vitest config). Do NOT repair or
   resurrect deprecated code. Leave their source otherwise untouched.

2. **Infra-dependent suites that time out at ~10s** (seen: storage-service,
   workflow-service `src/tests/workflow.test.ts`, notification-service, realtime-service,
   reporting-service `src/tests/reporting.test.ts`, billing-service, cadence-service
   health-check 503). These boot real servers expecting live DBs/Kafka/Meili. Policy:
   they must pass WITHOUT infra — mock the dependency, or guard the suite with an
   explicit env flag (e.g. skip with a clear reason unless `TEST_INFRA=1`). A suite must
   never fail by timeout on a clean machine. Do not weaken real unit assertions elsewhere
   to achieve this.

3. **Real assertion failures** (anything remaining, e.g. workflow join re-pause, RLS
   cleanup, auth permissions harness). Repair the CODE or the HARNESS minimally so the
   test's stated contract holds. If a test asserts behavior that is genuinely wrong,
   list it in your report instead of changing the assertion silently.

4. **Lint**: `pnpm lint` errors in `apps/web` (new BI files: components/bi/*,
   drilldown-drawer, schedule-dialog, hooks/use-bi, lib/bi-types, analytics pages).
   Fix by satisfying the rule, not by disabling rules file-wide; a targeted
   `eslint-disable-next-line` with a reason is acceptable where the rule is wrong.

## DO NOT TOUCH (owned by the orchestrator in a parallel branch)

- `services/cadence-service/src/services/queue.service.ts` and cadence prisma schema
- `services/auth-service/src/routes/auth.ts`
- `services/comm-service/**`
- `packages/kafka/src/index.ts`
- `.github/workflows/**`, `docker-compose*.yml`, any Dockerfile
- `scripts/**`, `docs/**`

If a gate failure traces INTO one of those files, report it; do not edit it.

## Report contract (final message)

- Per failure class: what was failing, what you changed, why.
- The three gate outputs' tails proving green (or exactly what remains red and why).
- Any test whose assertion you believe is wrong (listed, unchanged).
- Files touched (complete list).
