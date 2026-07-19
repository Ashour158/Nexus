#!/bin/sh
set -eu

domain=${DOMAIN:-}
public_ip=${PUBLIC_IP:-}
ports="
3000 3001 3002 3003 3004 3005 3006 3007 3008 3009
3010 3011 3012 3013 3014 3015 3016 3017 3018 3019
3020 3021 3022 3023 3024 3025 3026 3027 3028 3029
3030 3031 3032 3033 3034 3035 3036 3037 3038 3039
3040 3041 3042 3043
3100
4000 4001
4317 4318
5433
6379 6432
7700
8000 8001 8080 8088 8123 8443 8444
9000 9001 9090 9092 9093
"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

usage() {
  echo "Usage: DOMAIN=crm.example.com PUBLIC_IP=203.0.113.10 sh scripts/ssl-check.sh" >&2
  echo "   or: sh scripts/ssl-check.sh --domain crm.example.com --public-ip 203.0.113.10" >&2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) [ "$#" -ge 2 ] || die "--domain requires a value"; domain=$2; shift 2 ;;
    --public-ip) [ "$#" -ge 2 ] || die "--public-ip requires a value"; public_ip=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$domain" ] || { usage; die "DOMAIN is required"; }
[ -n "$public_ip" ] || { usage; die "PUBLIC_IP is required"; }

command -v openssl >/dev/null 2>&1 || die "openssl is required."
command -v curl >/dev/null 2>&1 || die "curl is required."

evidence=""
failures=""

record_ok() {
  evidence="${evidence}
OK: $*"
}

record_fail() {
  failures="${failures}
FAIL: $*"
}

resolved=$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' | sed 's/ $//')
if [ -z "$resolved" ] && command -v dig >/dev/null 2>&1; then
  resolved=$(dig +short A "$domain" | sort -u | tr '\n' ' ' | sed 's/ $//')
fi

case " $resolved " in
  *" $public_ip "*) record_ok "DNS A for $domain includes $public_ip ($resolved)" ;;
  *) record_fail "DNS A for $domain did not include $public_ip (got: ${resolved:-none})" ;;
esac

tls_out=$(printf '' | openssl s_client -connect "$public_ip:443" -servername "$domain" -verify_return_error -verify 8 </dev/null 2>&1 || true)
if printf '%s\n' "$tls_out" | grep -q 'Verify return code: 0 (ok)'; then
  subject=$(printf '%s\n' "$tls_out" | awk -F= '/subject=/{print $0; exit}')
  issuer=$(printf '%s\n' "$tls_out" | awk -F= '/issuer=/{print $0; exit}')
  record_ok "TLS SNI verification succeeded for $domain at $public_ip:443 (${subject:-subject unavailable}; ${issuer:-issuer unavailable})"
else
  record_fail "TLS SNI verification failed for $domain at $public_ip:443"
fi

https_headers=$(mktemp)
https_body=$(mktemp)
http_headers=$(mktemp)
trap 'rm -f "$https_headers" "$https_body" "$http_headers"' EXIT HUP INT TERM

https_code=$(curl -fsS --resolve "$domain:443:$public_ip" -D "$https_headers" -o "$https_body" -w '%{http_code}' "https://$domain/" 2>/dev/null || true)
case "$https_code" in
  2*|3*) record_ok "HTTPS returned $https_code" ;;
  *) record_fail "HTTPS request failed or returned ${https_code:-no status}" ;;
esac

if grep -iq '^strict-transport-security:' "$https_headers"; then
  record_ok "HSTS header present"
else
  record_fail "HSTS header missing"
fi

http_code=$(curl -sS --resolve "$domain:80:$public_ip" -D "$http_headers" -o /dev/null -w '%{http_code}' "http://$domain/" 2>/dev/null || true)
location=$(awk 'BEGIN{IGNORECASE=1} /^location:/ {print $2; exit}' "$http_headers" | tr -d '\r')
case "$http_code:$location" in
  30*:https://*) record_ok "HTTP redirects to HTTPS ($http_code $location)" ;;
  *) record_fail "HTTP did not redirect to HTTPS (status ${http_code:-none}, Location ${location:-none})" ;;
esac

if grep -Eio '(src|href)=["'\'']http://[^"'\'']+' "$https_body" >/dev/null 2>&1; then
  mixed=$(grep -Eio '(src|href)=["'\'']http://[^"'\'']+' "$https_body" | head -n 5 | tr '\n' ' ')
  record_fail "rendered HTML contains obvious mixed-content resource URLs: $mixed"
else
  record_ok "no obvious http:// src/href resource URLs in rendered HTML"
fi

for port in $ports; do
  if curl -sS --connect-timeout 3 --max-time 4 "telnet://$public_ip:$port" </dev/null >/dev/null 2>&1; then
    record_fail "direct host port $port reachable externally by TCP"
  else
    record_ok "direct host port $port unreachable externally"
  fi
done

printf 'Evidence summary:%s\n' "$evidence"
if [ -n "$failures" ]; then
  printf '%s\n' "$failures" >&2
  exit 1
fi

echo "All external edge checks passed."
