# Disaster Recovery Runbook

This is the stressed-operator path for total droplet loss. It is recovery from
encrypted backups, not failover. No real drill has been run in this repo state.

## Declare and Freeze

1. Declare a production incident and name an incident commander.
2. Freeze deployments, migrations, DNS changes, and manual data repair.
3. Lower DNS TTL if the DNS provider is reachable, but do not repoint yet.
4. Preserve evidence: incident time, last known good request, last successful
   backup artifact name, and operator names.

## Provision Host

```sh
ssh root@NEW_DROPLET_IP
apt-get update
apt-get install -y docker.io docker-compose-plugin postgresql-client-16 curl jq age rclone tar coreutils util-linux
systemctl enable --now docker
install -d -m 0755 /opt
git clone REPLACE_WITH_REPO_URL /opt/nexus
cd /opt/nexus
```

Production Compose always uses both files and the prod profile:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod config -q
```

## Recover Credentials

Install the SOPS age private key and decrypt the production env file outside the
repo:

```sh
install -d -m 700 /root/.config/sops/age /etc/nexus
install -m 600 nexus-prod-keys.txt /root/.config/sops/age/nexus-prod-keys.txt
export SOPS_AGE_KEY_FILE=/root/.config/sops/age/nexus-prod-keys.txt
sudo -E sh scripts/sops-decrypt.sh secrets/prod.env.sops.env /etc/nexus/prod.env
```

Recover the backup age identity and rclone config from the operator vault. Do
not print secrets:

```sh
install -d -m 700 /root/.config/rclone /root/.config/sops/age
install -m 600 rclone.conf /root/.config/rclone/rclone.conf
install -m 600 nexus-prod-keys.txt /root/.config/sops/age/nexus-prod-keys.txt
export AGE_IDENTITY_FILE=/root/.config/sops/age/nexus-prod-keys.txt
export BACKUP_AGE_IDENTITY_FILE=/root/.config/sops/age/nexus-prod-keys.txt
```

Verify the configured backup prefix and choose the newest usable artifact:

```sh
set -a; . /etc/nexus/prod.env; set +a
rclone lsl "$BACKUP_RCLONE_DEST" | sort
rclone copyto "$BACKUP_RCLONE_DEST/nexus-backup-YYYYmmddTHHMMSSZ.tar.age" /var/tmp/nexus-backup.tar.age
age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o /dev/null /var/tmp/nexus-backup.tar.age
```

## Restore Drill Before Production Restore

Run the drill into scratch targets first. This command produces measured
`RPO_SECONDS` and `RTO_SECONDS`; until it runs, those values are not measured:

```sh
ENV_FILE=/etc/nexus/prod.env BACKUP_AGE_IDENTITY_FILE=/root/.config/sops/age/nexus-prod-keys.txt sh scripts/nexus-restore-drill.sh /var/tmp/nexus-backup.tar.age
```

Abort if the drill report is missing any component evidence or if ClickHouse,
Meilisearch, Postgres, or MinIO counts do not match the manifest.

## Restore Production Layers

1. Keep DNS pointing away from the new droplet until restore and health checks
   pass.
   These commands replace production data. Require an explicit incident-commander
   confirmation in the current shell:

```sh
set -eu
export CONFIRM_PRODUCTION_RESTORE=DROP_AND_RESTORE_NEXUS
[ "$CONFIRM_PRODUCTION_RESTORE" = DROP_AND_RESTORE_NEXUS ] || exit 1
```

2. Decrypt the artifact into a private restore directory:

```sh
install -d -m 700 /var/tmp/nexus-prod-restore
age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o /var/tmp/nexus-prod-restore/backup.tar /var/tmp/nexus-backup.tar.age
tar -xf /var/tmp/nexus-prod-restore/backup.tar -C /var/tmp/nexus-prod-restore
jq -e '.complete == true' /var/tmp/nexus-prod-restore/manifest.json
```

3. Restore managed Postgres directly. Explicitly reject PgBouncer port `6432`;
   DDL and restore go to managed Postgres only:

```sh
set -a; . /etc/nexus/prod.env; set +a
[ "$BACKUP_PGPORT" != 6432 ]
export PGPASSWORD="$BACKUP_PGPASSWORD"
for dump in /var/tmp/nexus-prod-restore/postgres/*.dump; do
  db=$(basename "$dump" .dump)
  case "$db" in *[!A-Za-z0-9_.-]*) echo "unsafe database name: $db" >&2; exit 1;; esac
  expected_sha=$(jq -r --arg db "$db" '.postgres.databases[] | select(.name == $db) | .sha256' /var/tmp/nexus-prod-restore/manifest.json)
  [ "$(sha256sum "$dump" | awk '{print $1}')" = "$expected_sha" ] || exit 1
  psql -h "$BACKUP_PGHOST" -p "$BACKUP_PGPORT" -U "$BACKUP_PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists \"$db\" with (force);"
  psql -h "$BACKUP_PGHOST" -p "$BACKUP_PGPORT" -U "$BACKUP_PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "create database \"$db\";"
  pg_restore -h "$BACKUP_PGHOST" -p "$BACKUP_PGPORT" -U "$BACKUP_PGUSER" -d "$db" --no-owner --no-privileges "$dump"
  jq -r --arg db "$db" '.postgres.databases[] | select(.name == $db) | .table_rows[] | @base64' /var/tmp/nexus-prod-restore/manifest.json |
    while IFS= read -r item; do
      table=$(printf '%s' "$item" | base64 -d | jq -r '.table')
      expected=$(printf '%s' "$item" | base64 -d | jq -r '.rows')
      case "$table" in *[!A-Za-z0-9_.]*) echo "unsupported table identifier: $table" >&2; exit 1;; esac
      actual=$(psql -h "$BACKUP_PGHOST" -p "$BACKUP_PGPORT" -U "$BACKUP_PGUSER" -d "$db" -Atc "select count(*) from $table")
      [ "$actual" = "$expected" ] || { echo "$db.$table count mismatch" >&2; exit 1; }
    done
done
```

4. Restore ClickHouse schemas/data before starting analytics consumers:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod up -d clickhouse
while IFS="$(printf '\t')" read -r db tbl; do
  case "$db.$tbl" in *[!A-Za-z0-9_.$-]*) echo "unsafe ClickHouse identifier" >&2; exit 1;; esac
  schema="/var/tmp/nexus-prod-restore/clickhouse/${db}.${tbl}.schema.sql"
  data="/var/tmp/nexus-prod-restore/clickhouse/${db}.${tbl}.native"
  expected_schema_sha=$(jq -r --arg db "$db" --arg tbl "$tbl" '.clickhouse.tables[] | select(.database == $db and .table == $tbl) | .schema_sha256' /var/tmp/nexus-prod-restore/manifest.json)
  expected_data_sha=$(jq -r --arg db "$db" --arg tbl "$tbl" '.clickhouse.tables[] | select(.database == $db and .table == $tbl) | .data_sha256' /var/tmp/nexus-prod-restore/manifest.json)
  [ "$(sha256sum "$schema" | awk '{print $1}')" = "$expected_schema_sha" ] || exit 1
  [ "$(sha256sum "$data" | awk '{print $1}')" = "$expected_data_sha" ] || exit 1
  docker exec nexus-clickhouse clickhouse-client --query "CREATE DATABASE IF NOT EXISTS \`$db\`"
  docker exec nexus-clickhouse clickhouse-client --query "DROP TABLE IF EXISTS \`$db\`.\`$tbl\`"
  docker exec -i nexus-clickhouse clickhouse-client --multiquery < "$schema"
  docker exec -i nexus-clickhouse clickhouse-client --query "INSERT INTO \`$db\`.\`$tbl\` FORMAT Native" < "$data"
  actual=$(docker exec nexus-clickhouse clickhouse-client --format JSONEachRow --query "SELECT count() AS rows, toString(sum(cityHash64(*))) AS sum_cityhash64, toString(groupBitXor(cityHash64(*))) AS xor_cityhash64 FROM \`$db\`.\`$tbl\`")
  jq -e --arg db "$db" --arg tbl "$tbl" --argjson actual "$actual" \
    '.clickhouse.tables[] | select(.database == $db and .table == $tbl) |
     .rows == $actual.rows and .sum_cityhash64 == $actual.sum_cityhash64 and .xor_cityhash64 == $actual.xor_cityhash64' \
    /var/tmp/nexus-prod-restore/manifest.json >/dev/null
done < /var/tmp/nexus-prod-restore/clickhouse/tables.tsv
```

5. Restore Meilisearch v1.8 by importing the dump into the production volume
   before normal service start:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod stop meilisearch
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod create meilisearch
meili_volume=$(docker inspect nexus-meilisearch --format '{{range .Mounts}}{{if eq .Destination "/meili_data"}}{{.Name}}{{end}}{{end}}')
[ -n "$meili_volume" ]
docker rm -f nexus-meili-production-restore >/dev/null 2>&1 || true
export MEILI_MASTER_KEY
docker run -d --name nexus-meili-production-restore \
  -e MEILI_MASTER_KEY \
  -v "$meili_volume":/meili_data \
  -v /var/tmp/nexus-prod-restore/meilisearch:/restore:ro \
  getmeili/meilisearch:v1.8 \
  meilisearch --import-dump /restore/meilisearch.dump
i=0
until docker exec nexus-meili-production-restore /bin/sh -c 'wget -qO- --header="Authorization: Bearer $MEILI_MASTER_KEY" http://127.0.0.1:7700/health >/dev/null'; do
  i=$((i + 1)); [ "$i" -lt 180 ] || exit 1; sleep 1
done
docker exec nexus-meili-production-restore /bin/sh -c 'wget -qO- --header="Authorization: Bearer $MEILI_MASTER_KEY" http://127.0.0.1:7700/stats' |
  jq -c '[.indexes // {} | to_entries[] | {uid:.key, documents:(.value.numberOfDocuments // 0)}] | sort_by(.uid)' > /var/tmp/nexus-prod-restore/meili-actual.json
jq -c '.meilisearch.indexes | sort_by(.uid)' /var/tmp/nexus-prod-restore/manifest.json > /var/tmp/nexus-prod-restore/meili-expected.json
cmp -s /var/tmp/nexus-prod-restore/meili-expected.json /var/tmp/nexus-prod-restore/meili-actual.json
docker rm -f nexus-meili-production-restore
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod up -d meilisearch
```

6. Restore MinIO and verify object manifests:

```sh
export MC_HOST_nexus_prod="http://$(printf '%s' "${MINIO_ROOT_USER:-nexus}" | jq -sRr @uri):$(printf '%s' "$MINIO_ROOT_PASSWORD" | jq -sRr @uri)@127.0.0.1:9000"
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod up -d minio
install -d -m 700 /var/tmp/nexus-minio-verify
for bucket_dir in /var/tmp/nexus-prod-restore/minio/*; do
  [ -d "$bucket_dir" ] || continue
  bucket=$(basename "$bucket_dir")
  case "$bucket" in *[!A-Za-z0-9_.-]*) echo "unsafe bucket name: $bucket" >&2; exit 1;; esac
  mc mb --ignore-existing "nexus_prod/$bucket"
  mc mirror --overwrite "$bucket_dir" "nexus_prod/$bucket"
  mc mirror --overwrite "nexus_prod/$bucket" "/var/tmp/nexus-minio-verify/$bucket"
  (cd "/var/tmp/nexus-minio-verify/$bucket" && find . -type f | sed 's#^\./##' | LC_ALL=C sort |
    while IFS= read -r rel; do
      size=$(wc -c < "$rel" | tr -d ' ')
      sha=$(sha256sum "$rel" | awk '{print $1}')
      jq -nc --arg path "$rel" --arg sha "$sha" --argjson size "$size" '{path:$path,bytes:$size,sha256:$sha}'
    done) | jq -cs 'sort_by(.path)' > "/var/tmp/nexus-minio-verify/$bucket.actual.json"
  jq -c --arg bucket "$bucket" '.minio.buckets[] | select(.name == $bucket) | .items | sort_by(.path)' \
    /var/tmp/nexus-prod-restore/manifest.json > "/var/tmp/nexus-minio-verify/$bucket.expected.json"
  cmp -s "/var/tmp/nexus-minio-verify/$bucket.expected.json" "/var/tmp/nexus-minio-verify/$bucket.actual.json"
done
```

7. Start Compose:

```sh
cd /opt/nexus
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file /etc/nexus/prod.env --profile prod ps
```

8. Verify health and TLS:

```sh
sh scripts/healthcheck.sh
DOMAIN=crm.example.com PUBLIC_IP=NEW_DROPLET_IP sh scripts/ssl-check.sh
```

## DNS Cutover

Only after data restore and health checks pass:

```sh
dig +short crm.example.com
# update A record to NEW_DROPLET_IP in DNS provider
dig +short crm.example.com
```

Watch Caddy logs and application health for at least 30 minutes before closing
the incident.

## Rollback or Abort Points

- If backup decrypt fails, stop and recover the correct backup age identity.
- If restore drill fails, do not restore production; select an older artifact or
  repair the documented prerequisite.
- If Compose config fails, do not start the stack; fix env or image tag inputs.
- If TLS fails after DNS, roll DNS back to the maintenance page or previous edge.

## Drill Results

| Metric | Value |
|---|---|
| Last restore drill artifact | `nexus-backup-20260719T030444Z.tar.age` (sha256 `1ae2a0e34d78185e5c196ffca541fe436f07107cc43477a1af2c800a7d4e931e`), drill run `nexus_drill_20260719T030608Z` on 2026-07-19, report at `/var/log/nexus/nexus_drill_20260719T030608Z.json` |
| RPO_SECONDS | 84 (artifact captured 03:04:44Z, drill started 03:06:08Z) |
| RTO_SECONDS | 87 (full decrypt + 4-store scratch restore + equality assertions, 03:06:08Z→03:07:35Z) |
| Postgres evidence | verified: 33 databases pg_restore'd into scratch, per-table row counts equal to manifest |
| ClickHouse evidence | verified: 22 tables restored from Native dumps; rows + cityHash64 checksums equal (FINAL view for Replacing-style engines) |
| Meilisearch evidence | verified: dump imported into scratch v1.8, 7 index document counts equal |
| MinIO evidence | verified: bucket round-trip via mc mirror, object manifest equal (nexus-files: 0 objects at capture time — truthful) |

Measured on droplet 159.65.32.72 against DO managed Postgres (direct port
25060, `BACKUP_PGDATABASE=defaultdb`, `PGSSLMODE=require`). Off-host copy
currently lands on the `nexusoffsite` rclone alias
(`/var/backups/nexus-offsite`); point `BACKUP_RCLONE_DEST` at a real remote
(e.g. DO Spaces) for true off-host retention.

## Evidence and Sign-Off

Store the drill JSON, restore terminal transcript, selected artifact checksum,
Compose config output, health output, TLS output, DNS before/after, and incident
commander approval in the incident record.
