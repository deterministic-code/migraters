#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

conn='postgresql://proof:proof@127.0.0.1:55432/proof'
migrate-setup --create-database --provider postgres --connection "$conn"
migrate-up --provider postgres --connection "$conn"
docker compose -f proof/docker-compose.yml exec -T postgres \
  psql -U proof -d proof -v ON_ERROR_STOP=1 -f /dev/stdin < proof/sql/postgres/verify_up.sql
migrate-down --provider postgres --connection "$conn" --confirm
docker compose -f proof/docker-compose.yml exec -T postgres \
  psql -U proof -d proof -v ON_ERROR_STOP=1 -f /dev/stdin < proof/sql/postgres/verify_down.sql
