#!/bin/sh
set -eu

die() { printf '[install-backup-timer] ERROR: %s\n' "$*" >&2; exit 1; }
case "${1:-}" in -h|--help) printf 'Usage: sudo sh scripts/install-backup-timer.sh\nRequires repo at /opt/nexus.\n'; exit 0;; "") ;; *) die "unknown argument: $1";; esac
[ "$(id -u)" -eq 0 ] || die "run as root on the droplet"
repo=/opt/nexus
[ -f "$repo/scripts/nexus-backup.sh" ] || die "missing $repo/scripts/nexus-backup.sh"
ENV_FILE=/etc/nexus/prod.env BACKUP_AGE_IDENTITY_FILE=/root/.config/sops/age/nexus-prod-keys.txt sh "$repo/scripts/nexus-backup.sh" --preflight
install -d -m 0755 /etc/systemd/system
install -m 0644 "$repo/infrastructure/systemd/nexus-backup.service" /etc/systemd/system/nexus-backup.service
install -m 0644 "$repo/infrastructure/systemd/nexus-backup.timer" /etc/systemd/system/nexus-backup.timer
systemctl daemon-reload
systemctl enable --now nexus-backup.timer
systemctl is-enabled nexus-backup.timer >/dev/null
systemctl is-active nexus-backup.timer >/dev/null
systemctl list-timers nexus-backup.timer --no-pager
