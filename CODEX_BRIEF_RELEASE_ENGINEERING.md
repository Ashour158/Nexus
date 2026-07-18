# Codex task brief — Release engineering + test harness repair

You are working in the **Nexus** monorepo (pnpm workspaces + Turborepo, ~39 services,
Node 20, Fastify, Prisma 5.22, Postgres, Kafka, ClickHouse, Meilisearch, Next.js 14 web).

**Work on a new branch off current `fix/local-boot` HEAD:**
```
git checkout -b chore/release-engineering
```
Another engineer is working **concurrently** on `fix/local-boot`. Strict file ownership
applies — see "DO NOT TOUCH" below. Violating it will cause merge conflicts.

Commit in logical slices with clear messages. Do not merge or rebase onto
`fix/local-boot`; the human will integrate.

---

## Context you need (you have no repo memory — this is all of it)

Two audits just ran. Findings below are **verified**, not speculative. Evidence is quoted.

Recently fixed already (do not redo):
- Root typecheck and root build were failing on
  `import type { PrismaClient } from '@prisma/client'` in `packages/security/src/rls.ts`
  and `packages/service-utils/src/prisma-tenant.ts`. **Fixed** — every service generates
  its Prisma client to its own output path (`node_modules/.prisma/<service>-client`), so
  the bare `@prisma/client` package has no generated `default.d.ts` and exports no
  `PrismaClient` type. Both now use structural types.
- `npx turbo typecheck` now passes fully.
- `npx turbo build` now reaches 21 successful tasks. The only remaining failure is
  `@nexus/graphql-gateway`, which times out **downloading** Apollo's supergraph binary
  from `rover.apollo.dev` — network/supply-chain, not a code defect.

---

## YOUR SCOPE — two workstreams

### Workstream A — Release engineering (highest priority)

The CD pipeline is structurally incapable of deploying correctly. All verified:

**A1. Production compose is an overlay but CD invokes it standalone.**
- `docker-compose.prod.yml:1-2` says: `# Production overlay — use with: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
- `.github/workflows/cd.yml` (~line 240) runs: `docker compose -f docker-compose.prod.yml pull`
- Consequence: services defined only in the base file are missing. Verified: the `minio`
  block in `docker-compose.prod.yml` has **zero** `image:` or `build:` keys, so standalone
  rendering is invalid.
- Fix: make CD pass both files (`-f docker-compose.yml -f docker-compose.prod.yml`) for
  every compose invocation (pull/up/down/ps/logs). Verify with
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml config -q`.

**A2. Deploys are not reproducible.** Images are referenced as `:latest` (`cd.yml` contains
a `:latest` reference). There is **no `/version` endpoint anywhere** in the repo (verified:
no match for `'/version'` across `services/*/src` and `apps/web/src`).
- Fix: build and deploy images tagged with the immutable commit SHA (keep `:latest` as an
  additional convenience tag if you like, but deploy the SHA).
- Add a `GET /version` endpoint to every service returning at minimum
  `{ service, gitSha, builtAt }`, sourced from build args/env (e.g. `GIT_SHA`), so the
  running system can be asked what it is. There is a shared bootstrap at
  `packages/service-utils/src/server.ts` (`createService`) and a health-route helper
  (`registerHealthRoutes`) — **prefer adding it once there** so all services inherit it,
  rather than editing 39 services.
  ⚠️ `packages/service-utils` is shared and heavily used — run the full root typecheck
  after touching it.

**A3. CI/CD image matrices omit active services.** Cross-check the service list in
`.github/workflows/*.yml` against the actual directories under `services/` and against
the services defined in `docker-compose.yml`. Add the missing ones.

**A4. `scripts/migrate-all.sh:20`** omits active database owners while still listing
decommissioned services. Cross-check against services that own a `prisma/schema.prisma`
**and** appear in `docker-compose.yml`.
Known-decommissioned (present in the repo but intentionally NOT in docker-compose, and
therefore not deployed): `quotes-service`, `deals-service`, `accounts-service`,
`contacts-service`.

**A5. `scripts/health-check.sh:36`** probes `quotes-service:3033`, which is decommissioned
and not deployed. Reconcile the whole probe list against `docker-compose.yml`, using each
service's real `PORT`. **Ports are NOT guessable — read them from `docker-compose.yml`.**
Confirmed examples of non-obvious ports: reporting-service **3021**, finance-service
**3002**, notification-service **3003**, search-service **3006**, incentive-service
**3024**, knowledge-service **3023**, territory-service **3019**, planning-service **3020**.

**A6. Rollback can never work.** `scripts/rollback.sh:46` correctly refuses to guess a
target, but CD never records a known-good release for it to roll back to.
- Fix: have CD record the deployed SHA (e.g. to a file on the host and/or a
  `releases.log`) on every successful deploy, and have `rollback.sh` read it.
- Keep the refuse-to-guess behaviour; the bug is the missing record, not the guard.

**A7. Pin dependencies/images** where they are floating.

Out of scope for you (leave alone): image signing / SBOM. Note them in your report.

### Workstream B — Test harness repair

Verified current state (run these yourself to confirm):
- `cd services/crm-service && npx vitest run` → **10 failed, 122 passed**
- `cd services/finance-service && npx vitest run` → **45 failed, 78 passed**
- `services/search-service` → setup hook timeout
- `packages/service-utils` → tests pass but a worker exits unexpectedly
- Root vitest workspace references empty/incomplete packages — see
  `vitest.workspace.ts:209`

**These are stale mocks, not product bugs.** Diagnosis evidence from crm-service:
```
TypeError: Cannot read properties of undefined (reading 'findMany')
TypeError: Cannot read properties of undefined (reading 'findFirst')
expected "spy" to be called with arguments: [ 'tenant_test', 'contact_1', …(3) ]
expected 500 to be 201
```
New Prisma models were added to the services; the test mocks were never extended, so
`prisma.<newModel>` is `undefined` at call time. The `500`s are downstream of the same
missing mocks.

Your job: **make the mocks reflect the current schema** and get the suites green.

🚨 **CRITICAL CONSTRAINT — do not "fix" tests by weakening assertions.**
If a test fails because the *product* is genuinely wrong, do **not** change the assertion
to match the buggy output. Leave it failing and report it in a `PRODUCT-BUGS` section.
We are specifically hunting for real defects hidden behind harness noise; silencing one
would be worse than leaving the suite red. Prefer extending mocks/fixtures over editing
expectations. If you must change an expectation, justify it explicitly in your report.

⚠️ **Known interaction — read before touching crm-service tests.**
The other engineer just made two crm access-control gates **fail-closed**
(`src/lib/sharing.ts` `isSharingConfigured`, `src/lib/record-lock.ts`
`getActiveLock`). They previously swallowed DB errors and returned
"no sharing configured" / "not locked", which silently **skipped the permission
check entirely** — a real access-control bypass. They now throw
`SharingCheckUnavailableError` / `LockCheckUnavailableError`.

Consequence for you: crm went from **10 → 11** failures, and the new one is
`src/routes/deals.routes.test.ts > GET /api/v1/deals/:id returns deal`. That test
was only passing because the broken mock made the security gate disable itself.
**The correct fix is to add `orgWideDefault` / `sharingRule` / `recordLock` to the
Prisma mock** so the gate can evaluate. Do **not** revert the fail-closed change
and do **not** weaken the assertion.

Also fix: the search-service setup-hook timeout, the service-utils worker-exit warning,
and the root workspace referencing packages with no tests (`vitest.workspace.ts`).
`apps/web` has 23 unit tests + 5 E2E files but is **not** in the root workspace gate — add
it if that is straightforward.

---

## DO NOT TOUCH (owned by the concurrent engineer)

Editing these **will** cause conflicts:
- `docker-compose.yml` (the **base** file — `docker-compose.prod.yml` is yours)
- `packages/kafka/**`
- `docs/EVENTS.md` and the event-contract guard script
- Any **non-test** source under `services/crm-service/src/**` and
  `services/finance-service/src/**`
  (their `*.test.ts` / `__tests__/**` **are** yours)
- `services/analytics-service/**`
- `services/search-service/src/routes/**` (its tests are yours)
- Anything under `scripts/ddl/**`, `scripts/seed-*.mjs`
- `ENGINE_AUDIT_AND_PRODUCTION_READINESS.md`

If a Workstream A/B fix genuinely requires touching a do-not-touch file, **stop and report
it** rather than editing.

---

## Gates — run these yourself; do not trust a green feeling

```bash
# from repo root
npx turbo typecheck                 # MUST stay fully green (it passes today)
npx turbo build                     # only @nexus/graphql-gateway may fail (network)
docker compose -f docker-compose.yml -f docker-compose.prod.yml config -q   # must exit 0
cd services/crm-service     && npx vitest run
cd services/finance-service && npx vitest run
cd packages/service-utils   && npx vitest run     # 13 tenant-isolation tests must stay green
```
Note: `collect` times in this repo are slow (~2 min/suite). That is normal, not a hang.

Windows/Git Bash environment. Shell scripts under `scripts/` run on the Linux droplet, so
keep them POSIX `sh`-compatible.

---

## Report contract

When done, report:
1. **What you changed**, grouped A1–A7 / B, with file paths.
2. **Gate results** — paste actual output of each command above, before *and* after.
3. **`PRODUCT-BUGS`** — any test failure you believe is a real defect, left failing, with
   the failing assertion and your reasoning. **This section is the most valuable output of
   the whole task.** If it is empty, say so explicitly.
4. **Assumptions/judgement calls**, especially any assertion you changed.
5. **Blocked items** — anything needing a do-not-touch file, or that you could not verify.
6. Do **not** merge into `fix/local-boot`.
