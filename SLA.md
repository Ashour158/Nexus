# Nexus — Service Level Agreement (SLA) / Objectives (SLO)

Operator-adoptable template for the Nexus CRM production service. Numbers below
are **sensible defaults** for the current single-node deployment (DigitalOcean
droplet, `/opt/nexus`, docker-compose) — tune them to what you can actually
commit to, then publish to customers. This document defines availability
targets, support response times, maintenance windows, and incident handling.

> Reality check: Nexus currently runs on a **single node** with no HA/failover
> and nightly Postgres backups (RPO ≈ 24h). The uptime target below reflects
> that constraint. HA (multi-node, replicated Postgres, PITR/WAL archiving) is
> required before committing to a higher tier.

---

## 1. Availability

| Metric | Target | Notes |
|--------|--------|-------|
| **Monthly uptime (SLO)** | **99.0%** | ≈ 7h 18m allowed downtime/month. Realistic for single-node docker-compose. Raise to 99.9% only after HA + off-box PITR. |
| Planned maintenance | Excluded | Announced ≥ 48h ahead, within the window in §3. |
| Measurement | `scripts/healthcheck.sh` + Prometheus/Grafana | Uptime = successful `/health` on the web + core-CRM path over the month. |

**Exclusions from the uptime calculation:** scheduled maintenance (§3); force
majeure; customer-caused issues (misuse, invalid config, their network);
third-party dependency outages outside our control (Let's Encrypt, upstream
email/SMS providers, DigitalOcean); and any pre-GA / pilot period.

## 2. Support Response Times

Severity is set by **business impact**, not by who reports it. Response = time
to first human acknowledgement; target resolution/workaround is a goal, not a
guarantee. Support hours: **business hours (Sun–Thu, 09:00–18:00 local)** unless
a 24×7 contract is agreed; P1 is best-effort 24×7.

| Severity | Definition | Response | Target workaround/resolution |
|----------|------------|----------|------------------------------|
| **P1 — Critical** | Full outage or data-loss/security incident; core CRM unusable for all tenants; login down. | **1 hour** | 4 hours (mitigate/restore) |
| **P2 — High** | Major function broken, no workaround (e.g. quotes won't convert, search down, workflow delays stalled); one tenant fully blocked. | **4 business hours** | 2 business days |
| **P3 — Medium** | Function degraded with a workaround; non-blocking bug affecting some users. | **1 business day** | Next scheduled release |
| **P4 — Low** | Cosmetic, docs, or feature request; question. | **3 business days** | Backlog / as prioritized |

Contact channel(s), escalation contacts, and any 24×7 on-call terms are agreed
per-customer and recorded in the order form / support addendum.

## 3. Maintenance Windows

- **Standard window:** weekly, **Friday 22:00–24:00 UTC** (low-traffic). Most
  deploys are rolling (`docker compose up -d` per service) and cause no
  user-visible downtime.
- **Notice:** ≥ 48h for any window expected to cause downtime; emergency
  security patches may be applied with shorter notice and a post-hoc notice.
- **Secret rotation** that logs users out (JWT/`INTERNAL_SERVICE_TOKEN`/Postgres
  password) is treated as maintenance and only performed in-window — see
  [PRODUCTION.md §7](./PRODUCTION.md).
- **Backups** run nightly at 03:15 UTC (`scripts/backup.sh`) and are not a
  maintenance window (no downtime).

## 4. Incident Response

On a P1/P2, follow the established runbooks — do not improvise:

- **Incident response:** [`docs/runbooks/incident-response.md`](./docs/runbooks/incident-response.md)
- **Security breach:** [`docs/runbooks/security-breach.md`](./docs/runbooks/security-breach.md)
- **Database failover / restore:** [`docs/runbooks/database-failover.md`](./docs/runbooks/database-failover.md) + [PRODUCTION.md §8 (DR)](./PRODUCTION.md)
- **Redis failover:** [`docs/runbooks/redis-failover.md`](./docs/runbooks/redis-failover.md)

**Flow (summary):** detect (healthcheck cron / Prometheus alert) → declare
severity → assign an incident lead → mitigate or roll back (`scripts/rollback.sh`
to prior image tag; restore from `/opt/nexus/backups/` if data is affected) →
verify with `scripts/healthcheck.sh` (**ALL HEALTHY**) → communicate status to
affected tenants → **post-mortem** within 5 business days for any P1
(blameless; track corrective actions).

**Communication:** status + ETA to affected customers on declaration and at each
material update; final resolution notice on close. (A public status page /
maintenance-mode banner is not yet built — LR gap; communicate via the agreed
channel until it ships.)

## 5. Data Protection & Recovery Commitments

| Objective | Commitment | Basis |
|-----------|-----------|-------|
| **RPO (max data loss)** | ≤ 24h | Nightly `pg_dump` (`scripts/backup.sh`). Shorten with more frequent dumps or WAL/PITR. |
| **RTO (restore time)** | Best-effort within the P1 target | Assumes images already built; single-DB restore per PRODUCTION.md §8. |
| Backup retention | 14 dumps (`BACKUP_RETAIN`) | Copy off-box to survive host loss. |
| Tenant isolation | Enforced | `tenantId` auto-injected from verified JWT; verified live. |

## 6. Scope & Exclusions

**In scope:** the Nexus CRM application (34 services), its datastores, and the
operational tooling in this repo (backups, healthchecks, monitoring, DR
runbooks) running on the agreed environment.

**Out of scope / no commitment:** customer-side network or devices; third-party
integrations and their providers (Gmail/Twilio/WhatsApp/Stripe/SAML IdP/
Let's Encrypt/DigitalOcean); custom code or configuration the customer supplies;
any environment other than the designated production deployment; and features
explicitly marked pilot/beta. During the current **🟠 Pilot Only** phase these
targets are objectives (SLO), not contractual guarantees — see
[RELEASE_READINESS_AUDIT_2026-07-08.md](./RELEASE_READINESS_AUDIT_2026-07-08.md)
and the [Go-Live Checklist](./GO_LIVE_CHECKLIST.md).

---

## 7. Review

This SLA is reviewed quarterly and on any material change to the deployment
topology (e.g. move to HA/multi-node, PITR, or 24×7 support). Version and date
each revision.

| Version | Date | Change | Owner |
|---------|------|--------|-------|
| 0.1 (draft) | 2026-07-09 | Initial template grounded in single-node deployment. | |
