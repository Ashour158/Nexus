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

- [ ] Point DNS + run step 1 (HTTPS).
- [ ] Change `GRAFANA_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN` in `.env` (rotate off defaults).
- [ ] Firewall: expose only 80/443 publicly; restrict 9090/3034/3100 and the Docker daemon to your IP.
- [ ] Enable the backup + healthcheck cron (steps 2, 4).
- [ ] Set `NEXT_PUBLIC_SENTRY_DSN` if you want client error capture, then rebuild web.
- [ ] Consider a larger droplet or a second `web`/`crm` replica — the current box shows transient contention under concurrent load.
