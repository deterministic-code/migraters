#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

migrate-setup --create-database --provider sqlite --connection ./app.sqlite
migrate-up --provider sqlite --connection ./app.sqlite
sqlite3 ./app.sqlite < proof/sql/sqlite/verify_up.sql
migrate-down --provider sqlite --connection ./app.sqlite --confirm
sqlite3 ./app.sqlite < proof/sql/sqlite/verify_down.sql
