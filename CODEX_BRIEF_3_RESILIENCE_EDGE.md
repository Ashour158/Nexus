# Codex task brief #3 — Resilience, backup/restore, and edge security

Nexus monorepo (pnpm + Turborepo, ~39 Fastify services, Kafka, Prisma, ClickHouse,
Meilisearch, Next.js 14 web). Deployed as Docker Compose on a **single DigitalOcean
droplet** (`159.65.32.72`) with a managed Postgres instance alongside.

**Branch + worktree (the worktree worked well last round — keep doing it):**
```
git checkout -b chore/resilience-edge
git worktree add ../nexus-codex-3 chore/resilience-edge
cd ../nexus-codex-3
```

You have **no droplet access.** Everything here is config, scripts, and docs that a human
runs against the host. Write them to be run by someone else, and say exactly how.

---

## Context

Two audits rated this **not production-ready**. Release engineering, data correctness, and
event contracts are now largely closed (your two previous rounds plus parallel work). The
two remaining infrastructure P0s are yours.

The system currently concentrates web, gateway, databases, Kafka, Redis, search, identity
and observability **on one host**. A previous droplet already died once and the estate was
rebuilt from scratch — so this is a materialised risk, not a hypothetical.

Relevant known facts:
- The droplet is **load-fragile**: building more than ~2 services concurrently times out
  SSH. Any script you write must not assume generous resources.
- Prisma DDL must bypass pgbouncer (connect to the managed Postgres direct port, not the
  pooled one).
- `docker-compose.prod.yml` is an **overlay**; always
  `-f docker-compose.yml -f docker-compose.prod.yml`.
- There is a Caddy TLS setup and a `PRODUCTION.md` runbook already; extend rather than
  reinvent.

---

## Workstream A — Edge security (P0 #7)

An external probe found multiple service ports reachable and TLS not validated through the
intended hostname.

**A1. Inventory and close the edge.** Audit every `ports:` mapping in `docker-compose.yml`
and the prod overlay. Only **80/443** should be publicly bound. Everything else — Keycloak
admin, Kong, telemetry/metrics, databases, Kafka, MinIO console, and every application
service — must bind to `127.0.0.1` or be internal-only.
Note many are already `127.0.0.1:PORT:PORT` — verify rather than assume, and report a
before/after table.

**A2. Firewall.** Provide a `ufw` (or DO cloud-firewall) rule set as a runnable script plus
documentation. Default deny inbound, allow 22/80/443 only. Make it idempotent and make it
**refuse to lock the operator out** (never drop the active SSH session).

**A3. TLS through the real hostname.** Bare-IP HTTPS could not complete a handshake. That
may be expected (SNI/cert domain), but it means the deployment was never validated through
its production hostname. Document the exact cutover steps and provide a verification script
that proves: valid cert, correct chain, HSTS, no mixed content, and that direct app ports
are NOT reachable from outside.

**A4. Secrets.** SOPS config and encrypted-secret examples exist but are incomplete. Finish
the pattern so no plaintext secret is required in the repo, and document rotation.

## Workstream B — Backup, restore, and proven recovery (P0 #6)

**This is the highest-value item in the brief.** Backups that have never been restored are
not backups.

**B1. Encrypted automated backups** for: managed Postgres (all service databases),
ClickHouse, Meilisearch indexes, and MinIO objects. Scripted, scheduled, encrypted at rest,
retention documented.

**B2. A RESTORE DRILL script.** Restores into a scratch/throwaway target, verifies the data
landed (row counts / checksums, not "the command exited 0"), and **prints measured RPO and
RTO**. This is the deliverable that turns "we have backups" into evidence.

**B3. Disaster-recovery runbook.** Concrete, step-by-step, assuming the droplet is gone and
the operator is stressed. Include: what to provision, in what order, which secrets are
needed, how to verify each layer, and how long each step took in your drill.

**B4. Capacity and disk-pressure alerts.** The host is single-tenant and fragile; disk
exhaustion is a realistic outage cause. Alert before it happens.

**B5. Off-host observability** — get metrics/logs off the box so a host failure does not
also destroy the evidence needed to diagnose it. Prefer extending the existing
Prometheus/Grafana setup over introducing a new stack.

## Workstream C — Document the topology honestly

Update `PRODUCTION.md` (or add `ARCHITECTURE-RISKS.md`) with a candid statement of what the
current single-host topology does and does not provide: no HA, single point of failure,
recovery is restore-from-backup with the RPO/RTO you measured in B2. State what a
multi-host or managed-service topology would change, and roughly what it costs.

Do not oversell. The point is that a reader can make an informed risk decision.

---

## DO NOT TOUCH (owned by the concurrent engineer)

The other engineer is actively changing **service source** for tenant enforcement and event
contracts. Stay out of:
- `packages/service-utils/src/prisma-tenant.ts`
- Any **non-test** source under `services/**/src/**`
  (you should not need service source at all for this brief)
- `packages/kafka/**`
- `scripts/check-event-contracts.mjs` and `scripts/event-contract-allowlist.json`
- `scripts/ddl/**`, `scripts/seed-*.mjs`
- `ENGINE_AUDIT_AND_PRODUCTION_READINESS.md`

`docker-compose.yml` **is** yours for this brief (ports only — do not change service env
vars, several were just fixed). Flag any conflict rather than editing around it.

---

## Gates

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config -q   # must exit 0
npx turbo typecheck            # must stay 64/64
node scripts/check-event-contracts.mjs   # must not get WORSE (it is currently red by design)
sh -n <each script you write>  # POSIX syntax check; these run on Linux, you are on Windows
```
Also: every script must be **idempotent** and safe to re-run, and must fail loudly rather
than half-completing. This codebase's characteristic defect is silent failure — do not add
another one.

## Report contract

1. **What you changed**, per workstream, with file paths.
2. **Port exposure before/after table** (A1).
3. **Measured RPO and RTO from an actual drill** (B2). If you could not run a real drill
   without host access, say so plainly and state exactly what the operator must run to
   produce the numbers — do not estimate and present it as measured.
4. **Gate results** — pasted output.
5. **Residual risk** — what is still a single point of failure after your changes. Be
   blunt; an honest list is worth more than a green checkmark.
6. **Assumptions**, especially anything you could not verify without the host.
7. Open a PR; do not merge into `fix/local-boot`.
