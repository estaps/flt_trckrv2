#!/bin/sh
set -e

# Snapshot the app's schema before applying migrations, so a bad upgrade can be rolled back.
if [ "${BACKUP_BEFORE_MIGRATE:-true}" = "true" ]; then
  mkdir -p "${BACKUP_DIR:-/data/backups}"
  schema=$(echo "$DATABASE_URL" | sed -n 's/.*[?&]schema=\([^&]*\).*/\1/p')
  url=$(echo "$DATABASE_URL" | sed 's/?.*//')
  file="${BACKUP_DIR:-/data/backups}/pre-migrate-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  if pg_dump --no-owner ${schema:+--schema="$schema"} "$url" | gzip > "$file"; then
    echo "Backup written to $file"
  else
    echo "Pre-migration backup failed; refusing to start. Set BACKUP_BEFORE_MIGRATE=false to skip." >&2
    rm -f "$file"
    exit 1
  fi
fi

prisma migrate deploy --schema prisma/schema.prisma
exec "$@"
