# Nexus — Go-Live Checklist

Pre-launch sign-off for the Nexus CRM production deployment (DigitalOcean droplet
`64.225.27.128`, `/opt/nexus`, `docker-compose.yml`, branch `fix/local-boot`).

Status is grounded in the **Release-Readiness Audit (2026-07-08)** and the
**Production Cutover Runbook** ([PRODUCTION.md](./PRODUCTION.md)). Each item is
marked **DONE ✅**, **OPEN ⬜**, or **BLOCKED 🚧** (waiting on an external
dependency). Do not sign off while any launch-blocker (§8) is OPEN.

> Scope reality: this is a **single-node** docker-compose deployment (34 Fastify
> services + Postgres/pgbouncer, Redis, Kafka, MinIO, Meilisearch, ClickHouse,
> Kong gateway, Next.js web). The current recommendation is **🟠 Pilot Only** —
> a full production launch is gated on the blockers below.

---

## 1. Security

- [x] **Datastore ports bound to loopback** — pgbouncer 6432, ClickHouse 8123 confirmed `127.0.0.1`; the previously-exposed Postgres/Redis/Kafka/MinIO/Meilisearch/Kong-admin bindings have been pulled off `0.0.0.0` (PROD-01). ✅
- [x] **Default credentials rotated** — datastore + Kong-admin default password `nexus` rotated; `GRAFANA_ADMIN_PASSWORD` off default. See [PRODUCTION.md §7](./PRODUCTION.md). ✅
- [ ] **App-service ports (3000–3043), Keycloak 8080, Kong 8000/8001 restricted** — still published on `0.0.0.0` (JWT/auth-protected). Put behind Caddy or a `DOCKER-USER` iptables rule before public exposure (PRODUCTION.md §6). ⬜
- [x] **Report-route authz hole closed** — saved-reports + funnel routes registered without `requirePermission` (MOD-Reports-13); any authenticated user could read/export/delete reports. Verify patched. ✅ FIXED (a31ee08, deployed): 18 reporting routes now requirePermission.
- [ ] **JWT moved to HttpOnly/Secure cookie** — access token currently in a non-HttpOnly cookie (SEC-18). ⬜
- [ ] **Email-sync OAuth tokens encrypted at rest** — email-sync-service persists raw tokens (INT-01). ⬜
- [ ] **taxId/vatNumber PII encrypted + blind-indexed** — currently cleartext (DI-02). ⬜
- [ ] **Penetration test / external security review** performed and findings triaged. ⬜
- [x] RS256/JWKS auth, scrypt hashing, brute-force lockout, DOMPurify, no committed secrets — verified live (SEC 86). ✅
- [x] Multi-tenant isolation — `tenantId` auto-injected from verified JWT; foreign-tenant read → 404 (verified live). ✅

## 2. Data

- [ ] **Backups scheduled + verified** — `scripts/backup.sh` (pg_dump all DBs → `/opt/nexus/backups/`, 14-dump retention) installed as the 03:15 UTC cron per PRODUCTION.md §2; confirm `crontab -l` shows it and a test restore succeeds. ⬜
- [ ] **Backups copied off-box** — droplet-local dumps do not survive host loss; `rclone`/`aws s3 cp` to object storage (PRODUCTION.md §8). ⬜
- [ ] **Migrations applied** — `scripts/migrate-all.sh` / `make db-migrate` run against all 30 per-service DBs; `prisma migrate deploy` history clean. ⬜
- [x] **Recycle-Bin restore is non-destructive** — verify MOD-RecycleBin-05 patched (restore must clear `deletedAt`, not permanently drop the record). ✅ FIXED (d20d462, deployed): restore calls owning-service restore, verified round-trip.
- [ ] **Deal↔Account delete cascade reviewed** — `onDelete:Cascade` mass-delete hazard (DI-05); confirm reparent/Restrict behavior before any bulk/GDPR account delete. ⬜
- [x] Money stored as Decimal; tenant auto-inject + atomic merges — verified (DI). ✅

## 3. Observability

- [x] **Prometheus scraping all 34 services at `/metrics`** — running (PRODUCTION.md §3). ✅
- [x] **Grafana provisioned** — Prometheus datasource + "Nexus — Service Overview" dashboard auto-provisioned. ✅
- [x] **Prometheus alert rules active** — `infrastructure/prometheus/prometheus.yml` has no `rule_files`/`alerting` block, so **nothing fires** (DO-01). Add rules + Alertmanager (or webhook) before launch. ✅ FIXED (e866207): alerting block + rules/alerts.yml added.
- [ ] **Healthcheck cron + alerting** — `scripts/healthcheck.sh` polls all services' `/health`; install the `*/5` cron with `HEALTHCHECK_WEBHOOK` to Slack/Discord (PRODUCTION.md §4). ⬜
- [ ] **Notification channels fail loud** — external email/SMS/push channels silently no-op + swallow delivery failures (NOT-04/05); verify errors surface + DLQ fires. ⬜
- [ ] **Client error capture** — set `NEXT_PUBLIC_SENTRY_DSN` and rebuild web (optional). ⬜
- [x] Health probes + graceful shutdown + restart policies present on services (PROD). ✅

## 4. Scaling / DR

- [ ] **Single-node caveat acknowledged** — no HA/failover; droplet loss = outage until restore. Box shows transient contention under concurrent load; keep pilot concurrency low (≤2 heavy testers) or scale the droplet / add a `web`/`crm` replica. ⬜
- [ ] **DR runbook validated** — restore procedure + full-host-loss steps in [PRODUCTION.md §8](./PRODUCTION.md) walked through once. RPO ≈ 24h (nightly dumps), RTO depends on prebuilt images. ⬜
- [x] **Event backbone recovery** — outbox-relay drains queued Postgres `outbox` events to Kafka on restart (no domain-event loss on Kafka outage). ✅
- [ ] **ClickHouse rebuild path confirmed** — analytics read-model is rebuildable via `POST /api/v1/analytics/admin/rebuild` after a restore. ⬜

## 5. Smoke Tests (run against the target environment post-deploy)

- [ ] **Login** — demo/seeded user authenticates → RS256 token issued (verified live in the audit). ⬜
- [ ] **Core CRUD** — create/read/update a Lead, Contact, Account, Deal; confirm real data returns (200), unauth → 401, foreign-tenant → 404. ⬜
- [ ] **Lead-to-cash flow** — Deal → **RFQ → Quote** (quotes must originate from an RFQ: create→send→review→respond→ready→convert) → Order. Confirm amount roll-up + document numbering. ⬜
- [x] **CPQ money-math** — verify COM-01/02 patched: stacked discounts cannot drive unit price negative; cross-currency payments are not summed raw. ✅ FIXED (3a7e422, deployed): discount clamped, same-currency-only payment summing.
- [x] **Global search** — search returns core objects (deals/contacts/accounts/leads). Confirm SRCH-01 (`dealId`→`id` map + payload enrichment) patched, else search is non-functional. ✅ FIXED (e8d2b61, deployed): dealId->id map + enriched payloads, verified fresh deal indexed+searchable.
- [x] **Workflow delay** — an automation with a WAIT node advances past the delay (WF-01: WAIT must return `nextNodeId`). ✅ FIXED (4b7e287, deployed): WAIT node returns nextNodeId.
- [ ] `scripts/healthcheck.sh` → **ALL HEALTHY**. ⬜

## 6. Rollback Plan

- [ ] **Image rollback** — `scripts/rollback.sh` available; deploy pins image tags so a bad release reverts with `docker compose up -d` on the prior tag. Confirm the previous known-good tag is recorded before cutover. ⬜
- [ ] **DB rollback** — schema changes are forward-only (`prisma migrate deploy`); for a bad data state, restore the latest pre-deploy dump per [PRODUCTION.md §8](./PRODUCTION.md) restore procedure. ⬜
- [ ] **Config rollback** — `.env` lives on the host only; keep the prior `.env` snapshot so a bad secret/flag change reverts cleanly (git-reset must never clobber host `.env`). ⬜
- [ ] **Abort criteria defined** — healthcheck DOWN, failed smoke test, or auth failure → roll back to prior tag, announce, investigate. ⬜

## 7. External Dependency (BLOCKED)

- [ ] 🚧 **TLS + domain cutover** — **blocked until a domain is provisioned.** No domain exists yet. Caddy prod profile is staged and ready: point an A record at `64.225.27.128`, set `DOMAIN=` in `.env`, then `docker compose --profile prod up -d caddy` (auto Let's Encrypt, HSTS). Until then the app is HTTP-only at `http://64.225.27.128:3100`. See [PRODUCTION.md §1](./PRODUCTION.md). This is the one hard external blocker to a public launch. 🚧

---

## 8. Top OPEN Launch-Blockers (must clear before public production)

1. 🚧 **TLS/domain cutover** — no domain provisioned; app is HTTP-only. External dependency (§7).
2. ⬜ **App-service / Kong-admin / Keycloak ports still on `0.0.0.0`** — firewall or reverse-proxy before public exposure (§1).
3. ⬜ **CPQ money-math (COM-01/02)** — negative price via discount stacking; cross-currency payment summing. Verify patched in smoke (§5).
4. ⬜ **Recycle-Bin restore data-loss (MOD-RecycleBin-05)** — restore must un-delete, not permanently drop (§2).
5. ⬜ **Global search broken (SRCH-01)** — core objects unindexed; verify patched (§5).
6. ⬜ **Workflow WAIT nodes stall (WF-01)** — all time-delay automations hang; verify patched (§5).
7. ⬜ **Report-route authz hole (MOD-Reports-13)** — report data exfiltration by any authenticated user (§1).
8. ⬜ **Prometheus alerting non-functional (DO-01)** — no rules fire; operators are blind to incidents (§3).
9. ⬜ **Backups scheduled + copied off-box + test-restored** (§2).

---

## 9. Final Sign-Off

Launch proceeds only when every blocker in §8 is cleared (or explicitly waived
for a scoped pilot) and each owner signs below.

| Area | Owner | Status | Date | Notes |
|------|-------|--------|------|-------|
| Security (§1) | | ☐ Approved | | |
| Data / backups (§2) | | ☐ Approved | | |
| Observability (§3) | | ☐ Approved | | |
| Scaling / DR (§4) | | ☐ Approved | | |
| Smoke tests (§5) | | ☐ Approved | | |
| Rollback plan (§6) | | ☐ Approved | | |
| TLS / domain (§7) | | ☐ Approved / Waived | | |
| **Go / No-Go** | **Release Owner** | ☐ **GO** ☐ **NO-GO** | | |

*Reference: [RELEASE_READINESS_AUDIT_2026-07-08.md](./RELEASE_READINESS_AUDIT_2026-07-08.md) · [PRODUCTION.md](./PRODUCTION.md) · [SLA.md](./SLA.md)*
