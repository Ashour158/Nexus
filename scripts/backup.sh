#!/bin/sh
set -eu

# Compatibility wrapper. Production backups now use the serialized encrypted
# multi-component workflow.
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$DIR/nexus-backup.sh" "$@"
