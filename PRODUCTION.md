# Nexus — Production Cutover Runbook

Everything here is **staged and testable without a domain**. When you have a
domain, the TLS step is a one-shot cutover.

## 1. TLS + custom domain (Caddy, auto Let's Encrypt)

Prereq: a domain with an **A record** (and AAAA if using IPv6) pointing at the
droplet's public IP (`64.225.27.128`).

```bash
cd /opt/nexus
echo "DOMAIN=crm.yourcompany.com" >> .env      # the hostname users will visit
docker compose --profile prod up -d caddy       # binds :80/:443, gets a cert automatically
```

Caddy terminates HTTPS and reverse-proxies to the `web` container. It renews
certificates automatically. The app already sets X-Frame-Options / CSP /
X-Content-Type-Options / Referrer-Policy; Caddy adds HSTS on top.

Until then the app is reachable on plain HTTP at `http://64.225.27.128:3100`.

> Note: `NEXT_PUBLIC_*` values are baked at build time. If any absolute public
> URL is needed (e.g. portal links, e-sign callbacks), set it before building
> the `web` image. Same-origin `/bff` and `/api` traffic needs no change.

## 2. Backups (Postgres = system of record)

```bash
bash /opt/nexus/scripts/backup.sh               # writes /opt/nexus/backups/pg-<ts>.sql.gz
# schedule daily at 03:15 UTC:
( crontab -l 2>/dev/null; echo '15 3 * * * bash /opt/nexus/scripts/backup.sh >> /var/log/nexus-backup.log 2>&1' ) | crontab -
```

Retention keeps the newest 14 dumps (`BACKUP_RETAIN` to change). Restore:
`gunzip -c backups/pg-<ts>.sql.gz | docker exec -i nexus-postgres psql -U nexus`.
ClickHouse is a rebuildable analytics read-model — after a restore run
`POST /api/v1/analytics/admin/rebuild` to repopulate it.

## 3. Monitoring (already running)

Prometheus scrapes all 34 services at `/metrics`; Grafana + an OTEL collector
are up. Grafana now auto-provisions the Prometheus datasource and a
"Nexus — Service Overview" dashboard.

- Grafana: `http://64.225.27.128:3034` (admin / `GRAFANA_ADMIN_PASSWORD`, default `nexus_grafana` — change it in `.env`)
- Prometheus: `http://64.225.27.128:9090`

Lock these ports down (firewall to your IP, or put them behind Caddy with auth)
before real production use.

## 4. Uptime health checks + alerting

```bash
bash /opt/nexus/scripts/healthcheck.sh          # ALL HEALTHY (29/29) or non-zero + DOWN list
# every 5 min, alert to Slack/Discord on failure:
( crontab -l 2>/dev/null; echo '*/5 * * * * HEALTHCHECK_WEBHOOK=https://hooks.slack.com/... bash /opt/nexus/scripts/healthcheck.sh >> /var/log/nexus-health.log 2>&1' ) | crontab -
```

## 5. Pre-launch hardening checklist

- [x] Datastore + monitoring ports bound to `127.0.0.1` (pgbouncer 6432, clickhouse 8123, prometheus 9090, grafana 3034 — see §6).
- [x] Backup + healthcheck crons enabled (`crontab -l`; logs in `/var/log/nexus/`).
- [ ] Point DNS + run step 1 (HTTPS).
- [ ] Rotate secrets off defaults — see §7 for the safe order (Grafana is hot; JWT/Postgres are maintenance-window).
- [ ] Bind the remaining app-service ports (3000–3043, 8080 Keycloak, 8000/8001 Kong) behind the Caddy reverse proxy or a firewall (see §6, "Extending the lockdown").
- [ ] Set `NEXT_PUBLIC_SENTRY_DSN` if you want client error capture, then rebuild web.
- [ ] Consider a larger droplet or a second `web`/`crm` replica — the current box shows transient contention under concurrent load.

## 6. Network exposure lockdown (done for datastores/monitoring)

`docker-compose.yml` binds these to loopback so they are **not** reachable from
the public internet; internal services still reach them over the docker network
by DNS name, unaffected:

| Service    | Port | Reach it via |
|------------|------|--------------|
| pgbouncer  | 6432 | `docker exec` / SSH tunnel |
| clickhouse | 8123 | `docker exec` / SSH tunnel |
| prometheus | 9090 | SSH tunnel or Caddy (`/prometheus`) |
| grafana    | 3034 | SSH tunnel or Caddy (`/grafana`) |

SSH tunnel example (from your laptop): `ssh -L 3034:127.0.0.1:3034 root@<host>` then open `http://localhost:3034`.

**Extending the lockdown** — the app service ports (3000–3043), Keycloak (8080),
and Kong (8000/8001) are still published on `0.0.0.0`. They are all JWT/auth
protected, but for defence-in-depth put everything behind Caddy (step 1) and
either (a) change each `- 'PORT:PORT'` to `- '127.0.0.1:PORT:PORT'` in compose,
or (b) since Docker bypasses `ufw`, add a `DOCKER-USER` iptables rule:
`iptables -I DOCKER-USER -p tcp -m multiport --dports 3000:3043,8080,8000,8001 ! -s <your-ip> -j DROP`.

## 7. Secret rotation

**Hot (rotate anytime, no downtime):**
- `GRAFANA_ADMIN_PASSWORD` — set in `.env`, then `docker compose up -d grafana`.

**Maintenance-window (invalidates sessions or needs care):**
- `JWT_SECRET` / signing keys — rotating **logs every user out** (all existing
  access/refresh tokens fail verification). Do it during a window: set new value,
  `docker compose up -d` the auth-service and every service that verifies JWTs,
  then announce re-login. Prefer key rotation with an overlap (publish the new
  JWKS key alongside the old, flip signing, retire the old after max token TTL).
- `INTERNAL_SERVICE_TOKEN` — shared by service-to-service calls; roll all
  services together (`docker compose up -d`) or internal calls 401 mid-flight.
- `POSTGRES_PASSWORD` — the running Postgres was initialised with the old
  password; changing `.env` alone does **not** re-init it. Rotate with
  `ALTER ROLE ... PASSWORD` inside Postgres, update `.env` + pgbouncer userlist,
  then recreate pgbouncer and the DB-connected services.

Generate strong values with `openssl rand -base64 48`. Never commit real secrets
to the repo — `.env` stays on the host only.

## 8. Disaster recovery runbook

**Backups:** `scripts/backup.sh` runs nightly (02:00, cron) → `pg_dump` of every
database to `/opt/nexus/backups/` (system of record = Postgres). Copy these
off-box (e.g. `rclone`/`aws s3 cp` to object storage) — a droplet-local backup
does not survive droplet loss. Verify a backup monthly by restoring into a scratch DB.

**RTO/RPO:** with nightly dumps, worst-case data loss (RPO) is ~24h; shorten by
raising cron frequency or enabling Postgres WAL archiving/PITR. Target restore
time (RTO) below assumes images already built.

**Restore procedure (single DB):**
```bash
# 1. stop writers to that DB
docker compose stop crm-service finance-service   # (the services owning it)
# 2. restore the dump into direct Postgres (bypass pgbouncer)
gunzip -c /opt/nexus/backups/<db>-<date>.sql.gz | \
  docker exec -i nexus-postgres psql -U postgres -d <db>
# 3. restart writers, then run the healthcheck
docker compose start crm-service finance-service
bash /opt/nexus/scripts/healthcheck.sh
```

**Full host loss:**
1. Provision a new droplet, install Docker + compose.
2. `git clone` the repo to `/opt/nexus`, restore `.env` from your secret store.
3. `docker compose up -d` (Postgres init), then restore each DB dump (above).
4. Re-run `scripts/healthcheck.sh` → expect `ALL HEALTHY`.
5. Repoint DNS / TLS (step 1).

**Event backbone recovery:** the outbox-relay drains any events queued in Postgres
`outbox` tables to Kafka on restart, so a Kafka outage does not lose domain events
committed to Postgres — they replay once Kafka is back.
