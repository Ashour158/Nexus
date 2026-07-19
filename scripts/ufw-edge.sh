#!/bin/sh
set -eu

override=0

usage() {
  echo "Usage: sh scripts/ufw-edge.sh [--i-am-on-console-allow-firewall-change]" >&2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --i-am-on-console-allow-firewall-change) override=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

die() {
  echo "ERROR: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || die "run as root."
command -v ufw >/dev/null 2>&1 || die "ufw is required."

ssh_ok=0
if [ -n "${SSH_CONNECTION:-}" ]; then
  set -- $SSH_CONNECTION
  if [ "${4:-}" = "22" ]; then
    ssh_ok=1
  fi
fi

if [ "$ssh_ok" -ne 1 ] && [ "$override" -ne 1 ]; then
  die "refusing to change firewall state: current SSH session is not proven to terminate on server port 22. Re-run from the provider console with --i-am-on-console-allow-firewall-change if intentional."
fi

echo "Applying UFW edge policy. Docker-published ports can bypass UFW; Compose loopback bindings are the primary Docker port control."

ufw --force reset
ufw --force default deny incoming
ufw --force default allow outgoing

ufw allow 22/tcp comment 'nexus ssh'
ufw allow 80/tcp comment 'nexus http caddy'
ufw allow 443/tcp comment 'nexus https caddy'

ufw --force enable

status=$(ufw status verbose)
printf '%s\n' "$status"

printf '%s\n' "$status" | grep -q 'Status: active' || die "ufw is not active after enable."
printf '%s\n' "$status" | grep -Eq '^22/tcp[[:space:]]+ALLOW IN' || die "missing inbound allow for 22/tcp."
printf '%s\n' "$status" | grep -Eq '^80/tcp[[:space:]]+ALLOW IN' || die "missing inbound allow for 80/tcp."
printf '%s\n' "$status" | grep -Eq '^443/tcp[[:space:]]+ALLOW IN' || die "missing inbound allow for 443/tcp."
printf '%s\n' "$status" | grep -q 'Default: deny (incoming), allow (outgoing)' || die "unexpected default policy."

unexpected=$(printf '%s\n' "$status" | awk '
  /ALLOW IN/ {
    port = $1
    if (port != "22/tcp" && port != "80/tcp" && port != "443/tcp") {
      print
    }
  }
')

if [ -n "$unexpected" ]; then
  printf '%s\n' "$unexpected" >&2
  die "unexpected inbound allow rule remains after UFW reset."
fi

echo "UFW edge policy verified: inbound TCP 22/80/443 only, default deny incoming, default allow outgoing."
