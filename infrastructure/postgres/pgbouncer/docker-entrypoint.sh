#!/bin/sh
set -eu

# Generate the pgbouncer auth file (userlist.txt) at container start from the
# password carried in DATABASE_URL, instead of baking a credential into the
# image. This keeps the real (droplet) password out of git entirely — it lives
# only in the deployment's .env / DATABASE_URL — and makes the container immune
# to a `git reset --hard` clobbering a checked-in userlist.txt (which previously
# broke fleet-wide DB auth: pgbouncer held a SCRAM verifier for the wrong
# password and rejected every client with "SASL authentication failed").
#
# With auth_type=scram-sha-256, a plaintext password in userlist.txt is correct:
# pgbouncer derives the SCRAM verifier on the fly for client auth and reuses the
# same secret to log in to Postgres. If DATABASE_URL is absent (or unparsable),
# we fall back to whatever userlist.txt was shipped in the image so local dev
# with the default password still works.

AUTH_FILE="/etc/pgbouncer/userlist.txt"

if [ -n "${DATABASE_URL:-}" ]; then
  # postgresql://USER:PASS@HOST:PORT/DB  — parse with POSIX parameter expansion
  # (no sed) so odd characters in the password survive intact.
  _rest="${DATABASE_URL#*://}"   # USER:PASS@HOST:PORT/DB
  _creds="${_rest%%@*}"          # USER:PASS  (everything before the first @)
  _user="${_creds%%:*}"          # USER
  _pass="${_creds#*:}"           # PASS

  if [ -n "$_user" ] && [ -n "$_pass" ] && [ "$_creds" != "$_user" ]; then
    printf '"%s" "%s"\n' "$_user" "$_pass" > "$AUTH_FILE"
    echo "pgbouncer entrypoint: wrote $AUTH_FILE for user '$_user' from DATABASE_URL"
  else
    echo "pgbouncer entrypoint: DATABASE_URL present but unparsable; keeping shipped $AUTH_FILE" >&2
  fi
else
  echo "pgbouncer entrypoint: no DATABASE_URL; keeping shipped $AUTH_FILE"
fi

# Parameterize the upstream Postgres host/port. The checked-in ini points at
# the local dev container (`host=postgres port=5432`); prod runs against a
# managed cluster. Until now that difference lived as an UNCOMMITTED hand-edit
# of pgbouncer.ini inside the droplet's working tree — the exact divergence
# pattern that made three deploys silently ship stale code earlier (git pull
# --ff-only aborts on a locally-modified tracked file). With the override in
# env, the repo file is the single source of truth everywhere and the droplet's
# local edit can be reverted.
INI="/etc/pgbouncer/pgbouncer.ini"
if [ -n "${PGBOUNCER_UPSTREAM_HOST:-}" ]; then
  _port="${PGBOUNCER_UPSTREAM_PORT:-5432}"
  sed -i "s|^\* = host=.*|* = host=${PGBOUNCER_UPSTREAM_HOST} port=${_port}|" "$INI"
  echo "pgbouncer entrypoint: upstream set to ${PGBOUNCER_UPSTREAM_HOST}:${_port} from env"
fi

exec pgbouncer "$INI"
