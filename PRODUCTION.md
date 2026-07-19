# Nexus Production Cutover Runbook

Production is a single DigitalOcean droplet running Docker Compose. Always use
both Compose files and the prod profile for production commands:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod ...
```

This repo contains no real production credentials. The host, DNS, firewall, TLS,
backup, and decrypt steps below must be run by an operator on the droplet or from
an external machine as noted.

## Launch Readiness

Before cutover, work the pre-launch sign-off:

- [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md) - go/no-go checklist for
  security, data, observability, DR, smoke tests, rollback, and sign-off.
- [SLA.md](./SLA.md) - availability targets, P1-P4 response times,
  maintenance windows, and incident-response summary.

The old runbook named `64.225.27.128`; the task brief names `159.65.32.72`.
Treat both as unverified until the operator confirms the current droplet IP in
DigitalOcean and confirms DNS points at that IP.

## 1. DNS and Caddy Cutover

Prerequisites:

- A real production hostname in `DOMAIN`.
- An A record for `DOMAIN` pointing at the confirmed droplet public IP.
- A decrypted runtime dotenv outside the repo, for example `/etc/nexus/prod.env`.

Cutover from the droplet:

```sh
cd /opt/nexus
export ENV_FILE=/etc/nexus/prod.env
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE" --profile prod pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE" --profile prod up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file "$ENV_FILE" --profile prod ps
```

Caddy is the public edge. It binds host TCP 80/443, obtains and renews the
Let's Encrypt certificate for `DOMAIN`, adds HSTS, and proxies to `web:3000` on
the internal Docker network. Bare-IP HTTPS failure is expected and is not a
hostname TLS failure.

`NEXT_PUBLIC_*` values are baked at build time. If any absolute public URL is
needed for portal links, callbacks, or similar flows, set it before building the
`web` image. Same-origin `/bff` and `/api` traffic needs no change.

## 2. External Edge Verification

Run the hostname verifier from a machine outside the droplet network after DNS
has propagated:

```sh
DOMAIN=crm.example.com PUBLIC_IP=203.0.113.10 sh scripts/ssl-check.sh
```

or:

```sh
sh scripts/ssl-check.sh --domain crm.example.com --public-ip 203.0.113.10
```

The script verifies DNS, hostname TLS with SNI and chain verification, HTTPS
success, HSTS, HTTP-to-HTTPS redirect, obvious mixed-content `http://` resource
URLs, and that every host-published non-edge port is unreachable externally.
The negative probe list intentionally excludes 80/443 and includes:

```text
3000-3043, 3100, 4000, 4001, 4317, 4318, 5433, 6379, 6432, 7700,
8000, 8001, 8080, 8088, 8123, 8443, 8444, 9000, 9001, 9090, 9092, 9093
```

## 3. Firewall

Docker-published ports can bypass UFW, so Docker port protection primarily comes
from Compose loopback bindings. UFW is still the host edge policy.

From the droplet, after confirming the SSH session terminates on server port 22:

```sh
sudo sh scripts/ufw-edge.sh
```

The script requires root and refuses to change firewall state unless
`SSH_CONNECTION` proves the current SSH session terminates on server port 22.
When running from a verified provider console, use the explicit override:

```sh
sudo sh scripts/ufw-edge.sh --i-am-on-console-allow-firewall-change
```

After the guard passes, the script resets UFW, sets default deny incoming and
default allow outgoing, adds inbound TCP 22/80/443, enables UFW, and verifies no
other inbound allow rule remains.

## 4. Port Exposure Baseline

After this workstream, only Caddy binds publicly. All other published ports are
loopback-only or internal Docker-network ports.

| Service | Host port | Before | After |
|---|---:|---|---|
| caddy | 80 | public | public |
| caddy | 443 | public | public |
| alertmanager | 9093 | public | loopback `127.0.0.1` |
| graphql-gateway | 4000 | public | loopback `127.0.0.1` |
| keycloak | 8080 | public | loopback `127.0.0.1` |
| kong proxy | 8000 | public | loopback `127.0.0.1` |
| kong ssl proxy | 8443 | public | loopback `127.0.0.1` |
| otel-collector grpc | 4317 | public | loopback `127.0.0.1` |
| otel-collector http | 4318 | public | loopback `127.0.0.1` |
| router-coprocessor | 4001 | public | loopback `127.0.0.1` |
| web | 3100 | public | loopback `127.0.0.1` |

Loopback services are reachable for operators with SSH tunnels:

```sh
ssh -L 3034:127.0.0.1:3034 root@203.0.113.10   # Grafana
ssh -L 9090:127.0.0.1:9090 root@203.0.113.10   # Prometheus
ssh -L 9093:127.0.0.1:9093 root@203.0.113.10   # Alertmanager
ssh -L 8080:127.0.0.1:8080 root@203.0.113.10   # Keycloak
ssh -L 8001:127.0.0.1:8001 root@203.0.113.10   # Kong admin
```

Use `localhost:<local-port>` in the browser after opening the tunnel.

## 5. Monitoring and Health Checks

Prometheus, Grafana, Alertmanager, and the OTEL collector are part of the Compose
deployment. Their host ports are loopback-only, so use SSH tunnels or `docker
exec` for operator access rather than public URLs.

```sh
ssh -L 3034:127.0.0.1:3034 root@203.0.113.10
ssh -L 9090:127.0.0.1:9090 root@203.0.113.10
```

Uptime health check:

```sh
bash /opt/nexus/scripts/healthcheck.sh
```

Schedule with alerting after the host path and webhook are confirmed:

```sh
( crontab -l 2>/dev/null; echo '*/5 * * * * HEALTHCHECK_WEBHOOK=https://hooks.slack.com/... bash /opt/nexus/scripts/healthcheck.sh >> /var/log/nexus-health.log 2>&1' ) | crontab -
```

The exact healthy count can change as services are added or removed; treat a
non-zero exit and DOWN list as the actionable signal.

## 6. SOPS and Age Secret Flow

The production dotenv bundle is encrypted with SOPS using age. Docker Compose
consumes the decrypted dotenv through `--env-file`; plaintext stays outside the
repo and is never printed by the helper scripts.

Generate a private key outside the repo on a trusted workstation:

```sh
AGE_KEY_FILE="$HOME/.config/sops/age/nexus-prod-keys.txt" sh scripts/age-keygen.sh
```

The script writes mode `0600` and prints the public `age1...` recipient. Replace
`REPLACE_WITH_YOUR_AGE_PUBLIC_KEY` in `.sops.yaml` with that public recipient.
For multiple recipients during rotation, use a comma-separated recipient string
in the same `age:` field.

Create, validate, and encrypt the production dotenv:

```sh
cp secrets/prod.env.example secrets/prod.env
$EDITOR secrets/prod.env
sh scripts/sops-encrypt.sh secrets/prod.env secrets/prod.env.sops.env
rm -f secrets/prod.env
```

Commit `.sops.yaml` and `secrets/prod.env.sops.env`. Do not commit plaintext
dotenv files or age private keys.

On the droplet, install the age private key outside the repo and decrypt
atomically to the runtime env file:

```sh
install -d -m 700 /root/.config/sops/age /etc/nexus
install -m 600 nexus-prod-keys.txt /root/.config/sops/age/nexus-prod-keys.txt
export SOPS_AGE_KEY_FILE=/root/.config/sops/age/nexus-prod-keys.txt
sudo -E sh scripts/sops-decrypt.sh secrets/prod.env.sops.env /etc/nexus/prod.env
```

The decrypt helper requires root, refuses runtime paths inside the repo,
validates required non-empty production variables, rejects placeholders, writes
with mode `0600`, and avoids printing plaintext.

## 7. Secret Rotation

Recipient/key rotation:

1. Generate a new age key outside the repo with `scripts/age-keygen.sh`.
2. Add the new public recipient to `.sops.yaml` as a comma-separated recipient
   while keeping the old recipient.
3. Run `sops updatekeys -y secrets/prod.env.sops.env`.
4. Install the new private key on the droplet and verify decrypt works.
5. Remove the old recipient, run `sops updatekeys -y` again, then remove the old
   private key from hosts and CI.

Application-secret rotation:

- `GRAFANA_ADMIN_PASSWORD`: update encrypted dotenv, decrypt the runtime file,
  then recreate Grafana.
- `JWT_SECRET`: rotate during a maintenance window because existing tokens will
  fail verification. Prefer signing-key overlap where the auth implementation
  supports it.
- `INTERNAL_SERVICE_TOKEN`: roll all services together or internal calls can
  fail mid-deploy.
- `POSTGRES_PASSWORD`: change the database role password first, update the
  encrypted dotenv and PgBouncer credentials, then recreate PgBouncer and
  DB-connected services.

Generate strong values with `openssl rand -base64 48`.

## 8. Backups and Disaster Recovery

Postgres is the system of record. The current backup flow writes droplet-local
dumps; copy them off-box because a local backup does not survive droplet loss.

```sh
bash /opt/nexus/scripts/backup.sh
( crontab -l 2>/dev/null; echo '15 3 * * * bash /opt/nexus/scripts/backup.sh >> /var/log/nexus-backup.log 2>&1' ) | crontab -
```

Retention keeps the newest 14 dumps unless `BACKUP_RETAIN` is changed. Verify a
backup monthly by restoring into a scratch environment. ClickHouse is a
rebuildable analytics read model; after a Postgres restore, run the analytics
rebuild endpoint if needed.

Single-database restore outline:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod stop crm-service finance-service
gunzip -c /opt/nexus/backups/<db>-<date>.sql.gz | docker exec -i nexus-postgres psql -U postgres -d <db>
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod start crm-service finance-service
bash /opt/nexus/scripts/healthcheck.sh
```

Full host loss outline:

1. Provision a new droplet and install Docker plus Compose.
2. Clone the repo to `/opt/nexus`.
3. Restore the age private key and decrypt `/etc/nexus/prod.env`.
4. Start the stack with both Compose files and `--profile prod`.
5. Restore Postgres dumps, run health checks, then repoint DNS.

Event backbone recovery: the outbox relay drains domain events queued in
Postgres outbox tables to Kafka after restart, so events committed to Postgres
replay once Kafka is available.

## 9. Host Facts to Verify

- Current droplet public IP and DNS A record.
- Runtime path, owner, and mode for `/etc/nexus/prod.env`.
- UFW state after running `scripts/ufw-edge.sh`.
- External TLS and direct-port results from `scripts/ssl-check.sh`.
- Backup schedule, off-box copy target, and restore test evidence.
