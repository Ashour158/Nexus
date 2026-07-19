# Nexus Architecture Risks

## Current Topology

Production is a resource-fragile single DigitalOcean droplet plus managed
Postgres. One host is not high availability. Caddy, web, gateway, Kafka, Redis,
ClickHouse, Meilisearch, MinIO, identity, and observability remain shared-fate
on the droplet. Managed Postgres can survive droplet loss, but applications
still stop when the droplet stops.

Restore from backup is recovery, not failover. RPO and RTO are not measured in
this environment. Measure them with:

```sh
ENV_FILE=/etc/nexus/prod.env AGE_IDENTITY_FILE=/root/.config/age/nexus-backup-age-identity.txt sh scripts/nexus-restore-drill.sh /path/to/nexus-backup-YYYYmmddTHHMMSSZ.tar.age
```

## Residual Risks

- Single droplet loss stops all application traffic until a new host is
  provisioned and restored.
- Kafka, Redis, ClickHouse, Meilisearch, MinIO, Keycloak, Prometheus, Grafana,
  Alertmanager, and Caddy have shared host, disk, and kernel fate.
- Local Docker volumes are not durable across host loss unless captured by the
  encrypted backup workflow and verified by restore drill.
- Periodic off-host observability export is delayed evidence, not live remote
  telemetry.
- Capacity pressure can still cause cascading failures before alerts are acted
  on.
- Managed Postgres protects database storage better than the droplet, but DDL,
  restore, and credentials still require disciplined operator access.

## Phased Target

Phase 1 keeps the droplet model but hardens operations: encrypted off-host
backups, restore drills, capacity alerts, off-host evidence export, and exact DR
runbooks. Cost category: current droplet, managed Postgres, object storage or
rclone target, and alert webhook.

Phase 2 splits shared-fate services: managed Redis, managed object storage,
managed search or a dedicated Meilisearch node, managed ClickHouse or separate
analytics VM, and managed log/metric endpoints. Cost category: several small
managed services plus storage and egress.

Illustrative current cost anchors, re-check before purchase:

- DigitalOcean Droplets pricing page, accessed 2026-07-19:
  https://www.digitalocean.com/pricing/droplets. The page currently lists Basic
  8 GiB / 4 vCPU at $48/month and General Purpose 8 GiB / 2 dedicated vCPU at
  $63/month.
- DigitalOcean Spaces pricing docs, accessed 2026-07-19:
  https://docs.digitalocean.com/products/spaces/details/pricing/. The page
  currently lists Spaces base at $5/month including 250 GiB.
- Two app nodes are therefore roughly $96-$126/month before load balancer,
  managed data services, logs/metrics, backup storage overages, and egress. This
  is not a total architecture estimate.

Phase 3 moves the application tier to multiple hosts or a managed orchestrator
behind a load balancer, with remote-write metrics and centralized logs. Cost
category: load balancer, two or more app nodes, managed data services, backup
storage, log ingestion, metric retention, and on-call alerting.

## Decision Triggers

- Any customer-facing uptime commitment above single-host best effort.
- Backup artifact age or restore drill duration exceeds business tolerance.
- Disk or inode warning fires more than twice in a week.
- Kafka, Redis, ClickHouse, Meilisearch, or MinIO recovery dominates drill time.
- The droplet regularly exceeds 70 percent CPU or memory during normal traffic.
- Compliance requires independently retained logs or immutable backup evidence.
