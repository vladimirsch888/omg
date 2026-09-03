#!/usr/bin/env bash
#
# Every 5 minutes (cron): if an API doesn't answer /api/health, restart its
# service and log it. Cheap self-healing for a single-VPS setup where nobody
# is watching a dashboard at 3 a.m.
#
set -uo pipefail

LOG="/var/log/revenue-healthcheck.log"

check() {
  local name="$1" port="$2"
  if ! curl -fsS -m 5 "http://127.0.0.1:${port}/api/health" >/dev/null; then
    echo "$(date '+%F %T') $name: /api/health failed, restarting" >> "$LOG"
    systemctl restart "$name"
  fi
}

check revenue-api-prod 4000
check revenue-api-staging 4001
