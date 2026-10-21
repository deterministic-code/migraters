#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

conn='system/proof@127.0.0.1:51521/FREEPDB1'
migrate-setup --create-database --provider oracle --connection "$conn"
migrate-up --provider oracle --connection "$conn"
docker compose -f proof/docker-compose.yml exec -T oracle \
  sqlplus -S system/proof@FREEPDB1 < proof/sql/oracle/verify_up.sql
migrate-down --provider oracle --connection "$conn" --confirm
docker compose -f proof/docker-compose.yml exec -T oracle \
  sqlplus -S system/proof@FREEPDB1 < proof/sql/oracle/verify_down.sql
