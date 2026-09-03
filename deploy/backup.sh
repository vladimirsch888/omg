#!/usr/bin/env bash
#
# Nightly PostgreSQL backup for both environments. Installed by
# bootstrap-vps.sh to /usr/local/bin/revenue-backup and run from cron at
# 03:00; keeps the last 14 days locally. Copy the directory off the server
# (rsync/rclone) if you want protection against losing the VPS itself.
#
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/revenue-saas}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

for DB in revenue_saas_prod revenue_saas_staging; do
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
    sudo -u postgres pg_dump --format=custom "$DB" | gzip > "$BACKUP_DIR/${DB}_${STAMP}.dump.gz"
    echo "backup: $DB -> $BACKUP_DIR/${DB}_${STAMP}.dump.gz"
  fi
done

find "$BACKUP_DIR" -name '*.dump.gz' -mtime +"$KEEP_DAYS" -delete

# Restore example (creates a fresh DB from a dump):
#   gunzip -c /opt/backups/revenue-saas/revenue_saas_prod_2026-09-03_0300.dump.gz \
#     | sudo -u postgres pg_restore --clean --if-exists -d revenue_saas_prod
