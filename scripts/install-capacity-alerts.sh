#!/bin/sh
set -eu

die() { printf '[install-capacity-alerts] ERROR: %s\n' "$*" >&2; exit 1; }
case "${1:-}" in -h|--help) printf 'Usage: sudo sh scripts/install-capacity-alerts.sh\nRequires repo at /opt/nexus.\n'; exit 0;; "") ;; *) die "unknown argument: $1";; esac
[ "$(id -u)" -eq 0 ] || die "run as root on the droplet"
repo=/opt/nexus
[ -x "$repo/scripts/check-capacity.sh" ] || [ -f "$repo/scripts/check-capacity.sh" ] || die "missing $repo/scripts/check-capacity.sh"
ENV_FILE=/etc/nexus/prod.env sh "$repo/scripts/check-capacity.sh" --preflight
install -d -m 0755 /etc/systemd/system
install -m 0644 "$repo/infrastructure/systemd/nexus-capacity-check.service" /etc/systemd/system/nexus-capacity-check.service
install -m 0644 "$repo/infrastructure/systemd/nexus-capacity-check.timer" /etc/systemd/system/nexus-capacity-check.timer
systemctl daemon-reload
systemctl enable --now nexus-capacity-check.timer
systemctl is-enabled nexus-capacity-check.timer >/dev/null
systemctl is-active nexus-capacity-check.timer >/dev/null
systemctl list-timers nexus-capacity-check.timer --no-pager
