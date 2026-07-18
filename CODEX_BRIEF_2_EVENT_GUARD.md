# Codex task brief #2 — Event contract guard + credential hygiene + effect probes

Nexus monorepo (pnpm workspaces + Turborepo, ~39 Fastify services, Kafka, Prisma 5.22,
ClickHouse, Meilisearch, Next.js 14 web). Windows/Git Bash locally; shell scripts run on a
Linux droplet, so keep them POSIX `sh`-compatible.

**Branch off current `fix/local-boot` HEAD:**
```
git checkout -b chore/event-contract-guard
```
⚠️ **Work in your own git worktree so we do not share a working directory:**
```
git worktree add ../nexus-codex chore/event-contract-guard
cd ../nexus-codex
```
Last round we collided in one checkout and a commit landed on the wrong branch. Please use
the worktree.

Another engineer is concurrently changing tenant-isolation plumbing — see DO NOT TOUCH.

---

## Why this task exists (context you cannot get from the code)

Two audits found the same systemic defect: **this codebase fails silently.** Consumers are
"healthy" (45/45 Kafka groups Stable, lag 0) while producing nothing. Confirmed real bugs,
all now fixed, all of which a contract guard would have caught automatically:

| Bug | Why it was invisible |
|---|---|
| `invoice.paid` published to `nexus.finance.payments`, but analytics-service only subscribed `nexus.finance.invoices` | handler was registered, so code review saw nothing wrong — it was unreachable |
| `quote.created_from_rfq` emitted by the RFQ path; consumer only handled `quote.created` | quotes must originate from an RFQ, so quote creation was never counted at all |
| GDPR erasure published to a topic literally named `gdpr.erasure.requested`; approval-service and workflow-service subscribed `TOPICS.AUDIT` | personal data survived erasure in two services |
| `nexus.crm.custom-fields` not in `TOPICS` → `validateTopic()` throws → error swallowed | custom-field events silently never emitted (STILL OPEN) |

**Kafka lag is a worthless health signal here**: `NexusConsumer` retries 3× then commits
the offset anyway, so a permanently-failing handler shows lag 0 while discarding every
event. Do not build anything that treats lag as health.

---

## Workstream 1 — Build the event contract guard (primary deliverable)

There is **no guard today.** `docs/EVENTS.md` exists (~26KB) but nothing verifies it. You
are building this, not repairing it.

Create `scripts/check-event-contracts.mjs` (Node built-ins only, ESM, no deps — matches
the other scripts here) plus a root `package.json` script (e.g. `events:check`) and a CI
step in `.github/workflows/ci.yml`.

**What it must do — statically, no running system:**

1. **Extract publishers.** Two mechanisms:
   - direct: `producer.publish(TOPICS.X, { type: '<event.type>', ... })`
   - transactional outbox: rows written with a `topic` + `eventType`, drained by
     `services/outbox-relay`
   Resolve `TOPICS.*` constants via `packages/kafka/src/index.ts`. Note some call sites
   pass a **literal string** as the topic (that is the GDPR bug) — capture those too.
2. **Extract consumers.** For each service: the topic list passed to `consumer.subscribe([...])`
   and every `consumer.on('<event.type>', ...)`. Resolve `TOPICS.*` the same way.
   **Critically:** only count a consumer as started if its `start*Consumer(...)` is actually
   invoked from that service's boot path (`src/index.ts`, or `server.ts` when index.ts
   delegates to `buildServer()` — billing-service and crm-service both do this). A consumer
   defined but never invoked is dead code and must be reported.
3. **Cross-reference and FAIL on:**
   - **(a) Unreachable handler** — a service registers `consumer.on(E)` but does not
     subscribe the topic that carries `E`. *(This is the `invoice.paid` class.)*
   - **(b) Orphan event** — an event type is published but no started consumer anywhere
     handles it.
   - **(c) Phantom handler** — a handler exists for an event type nothing publishes.
   - **(d) Off-contract topic** — a topic string published that is not in `TOPICS`.
4. **Allowlist with justification.** Some orphans are intentional (e.g. events emitted for
   future consumers). Support an allowlist where each entry REQUIRES a reason string;
   entries without one fail. Put it in a data file, not inline in the script.
5. **Regenerate `docs/EVENTS.md`** from the extracted data (or emit a `--check` mode that
   fails when the doc is stale), so the doc cannot drift again.

**Self-proving requirement:** the guard must be demonstrably able to catch the real bugs.
Include a test fixture reproducing the `invoice.paid`-on-wrong-topic shape and assert the
guard flags it. A guard that reports "all clear" on a codebase whose bugs it was built to
find is worse than no guard.

**Expect it to be RED on first run.** At minimum `nexus.crm.custom-fields` (bug #4 above)
is still broken. Report what it finds; do not mass-allowlist findings to force it green.
Fixing the findings is a follow-up task, not this one — except the trivially safe ones,
which you should list separately for review.

## Workstream 2 — Credential hygiene

`scripts/seed-demo-live.mjs` has a hardcoded default password (`Demo1234!`) and logs
sensitive auth details. `scripts/seed-commercial-live.mjs` likely shares the pattern.
- Require the password via env with **no default**; exit with a clear message if unset.
- Stop logging tokens/credentials/auth payloads.
- Keep the scripts usable for demo seeding — do not delete them.

## Workstream 3 — Effect-level health probes

Add probes that assert **output**, not connectivity, since lag is meaningless here.
Prefer adding once in `packages/service-utils` (there is a `registerHealthRoutes` helper
and a `/health` + `/version` pattern already) over editing 39 services.

Expose per-engine counters such as: rows written by a consumer in the last interval,
outbox rows PENDING and age of the oldest, DLQ depth/age. Wire them into the existing
Prometheus/metrics surface if one is present (`/metrics` exists on services).

⚠️ `packages/service-utils` is shared by every service — run the FULL root typecheck after
touching it.

---

## DO NOT TOUCH (owned by the concurrent engineer)

- `packages/service-utils/src/prisma-tenant.ts` (tenant isolation — actively being changed)
- `docker-compose.yml` (the base file)
- Any **non-test** source under `services/crm-service/src/**`, `services/finance-service/src/**`
- `services/analytics-service/**`
- `scripts/ddl/**`
- `ENGINE_AUDIT_AND_PRODUCTION_READINESS.md`

`packages/service-utils/src/health.ts` and `server.ts` ARE yours for Workstream 3.
If a fix genuinely needs a do-not-touch file, **stop and report** rather than editing.

---

## Gates — run these yourself

```bash
npx turbo typecheck            # MUST stay 64/64 successful
npx turbo build                # only @nexus/graphql-gateway may fail (network: it downloads
                               # an Apollo binary from rover.apollo.dev and times out)
node scripts/check-event-contracts.mjs   # your new guard
cd services/crm-service     && npx vitest run   # must stay 134/134
cd services/finance-service && npx vitest run   # must stay 123/123
cd packages/service-utils   && npx vitest run   # must stay 32/32
```
Suite `collect` times are slow (~2 min). That is normal, not a hang.

## Report contract

1. **What you changed**, per workstream, with file paths.
2. **Gate results** — actual pasted output, before and after.
3. **`GUARD-FINDINGS`** — everything the new guard flags, categorised (a)-(d), each marked
   *real bug* / *intentional (allowlisted, with reason)* / *unsure*. **This is the most
   valuable output of the task.** If the guard finds nothing, say so explicitly and explain
   how you verified it can detect the seeded fixture.
4. **Assumptions and judgement calls.**
5. **Blocked items.**
6. Do **not** merge into `fix/local-boot` — open a PR.
