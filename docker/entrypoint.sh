#!/bin/sh
set -e

# Only the web container migrates; the worker sets SKIP_MIGRATIONS=true and waits for the schema.
if [ "${SKIP_MIGRATIONS:-false}" = "true" ]; then
  exec "$@"
fi

# Snapshot the app's schema before applying migrations, so a bad upgrade can be rolled back.
if [ "${BACKUP_BEFORE_MIGRATE:-true}" = "true" ]; then
  dir="${BACKUP_DIR:-/data/backups}"
  mkdir -p "$dir"
  schema=$(echo "$DATABASE_URL" | sed -n 's/.*[?&]schema=\([^&]*\).*/\1/p')
  url=$(echo "$DATABASE_URL" | sed 's/?.*//')
  # On the first start the schema does not exist yet, so there is nothing to back up.
  if ! exists=$(echo "select 1 from pg_namespace where nspname = :'s'" | psql "$url" -X -q -t -A -v ON_ERROR_STOP=1 -v s="${schema:-public}"); then
    echo "Pre-migration backup: cannot reach the database; refusing to start." >&2
    exit 1
  fi
  if [ "$exists" != "1" ]; then
    echo "Pre-migration backup skipped: schema ${schema:-public} does not exist yet (first start)."
  else
    raw="$dir/pre-migrate-$(date -u +%Y%m%dT%H%M%SZ).sql"
    # Dump to a file first: in a pipe into gzip, a pg_dump failure would go unnoticed.
    if pg_dump --no-owner ${schema:+--schema="$schema"} --file="$raw" "$url" && gzip "$raw"; then
      echo "Backup written to $raw.gz"
    else
      echo "Pre-migration backup failed; refusing to start. pg_dump must be the same major version as the server or newer ($(pg_dump --version))." >&2
      echo "Set BACKUP_BEFORE_MIGRATE=false to skip the backup." >&2
      rm -f "$raw" "$raw.gz"
      exit 1
    fi
  fi
fi

prisma migrate deploy --schema prisma/schema.prisma
exec "$@"
