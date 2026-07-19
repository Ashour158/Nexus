#!/bin/sh
set -eu

key_file=${AGE_KEY_FILE:-"$HOME/.config/sops/age/nexus-prod-keys.txt"}

if ! command -v age-keygen >/dev/null 2>&1; then
  echo "ERROR: age-keygen is required." >&2
  exit 1
fi

case "$key_file" in
  ""|/*) ;;
  *) echo "ERROR: AGE_KEY_FILE must be an absolute path." >&2; exit 1 ;;
esac

if [ -e "$key_file" ]; then
  echo "ERROR: refusing to overwrite existing key file: $key_file" >&2
  exit 1
fi

umask 077
mkdir -p "$(dirname "$key_file")"
tmp="${key_file}.tmp.$$"
trap 'rm -f "$tmp"' EXIT HUP INT TERM

age-keygen -o "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$key_file"
trap - EXIT HUP INT TERM

recipient=$(grep '^# public key: age1' "$key_file" | sed 's/^# public key: //')
if [ -z "$recipient" ]; then
  echo "ERROR: could not read age public recipient from $key_file" >&2
  exit 1
fi

echo "Age private key written outside the repo: $key_file"
echo "Private key mode set to 0600."
echo "Public recipient to commit in .sops.yaml:"
echo "$recipient"
