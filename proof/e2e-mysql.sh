#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

conn='mysql://root:proof@127.0.0.1:53306/proof'
migrate-setup --create-database --provider mysql --connection "$conn"
migrate-up --provider mysql --connection "$conn"
docker compose -f proof/docker-compose.yml exec -T mysql \
  mysql -uroot -pproof proof < proof/sql/mysql/verify_up.sql
migrate-down --provider mysql --connection "$conn" --confirm
docker compose -f proof/docker-compose.yml exec -T mysql \
  mysql -uroot -pproof proof < proof/sql/mysql/verify_down.sql
