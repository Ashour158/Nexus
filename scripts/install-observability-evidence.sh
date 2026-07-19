#!/bin/sh
set -eu

die() { printf '[install-observability-evidence] ERROR: %s\n' "$*" >&2; exit 1; }
case "${1:-}" in -h|--help) printf 'Usage: sudo sh scripts/install-observability-evidence.sh\nRequires repo at /opt/nexus.\n'; exit 0;; "") ;; *) die "unknown argument: $1";; esac
[ "$(id -u)" -eq 0 ] || die "run as root on the droplet"
repo=/opt/nexus
[ -f "$repo/scripts/export-observability-evidence.sh" ] || die "missing $repo/scripts/export-observability-evidence.sh"
ENV_FILE=/etc/nexus/prod.env BACKUP_AGE_IDENTITY_FILE=/root/.config/age/nexus-backup-age-identity.txt sh "$repo/scripts/export-observability-evidence.sh" --preflight
install -d -m 0755 /etc/systemd/system
install -m 0644 "$repo/infrastructure/systemd/nexus-observability-export.service" /etc/systemd/system/nexus-observability-export.service
install -m 0644 "$repo/infrastructure/systemd/nexus-observability-export.timer" /etc/systemd/system/nexus-observability-export.timer
systemctl daemon-reload
systemctl enable --now nexus-observability-export.timer
systemctl is-enabled nexus-observability-export.timer >/dev/null
systemctl is-active nexus-observability-export.timer >/dev/null
systemctl list-timers nexus-observability-export.timer --no-pager
