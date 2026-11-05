#!/usr/bin/env bash
set -euo pipefail
cd /app
export CONN="./app.sqlite"
npx migrate-setup --provider sqlite --connection "$CONN"
npx migrate-up --provider sqlite --connection "$CONN"
sqlite3 "$CONN" < ./sql/verify_up.sql
npx migrate-down --provider sqlite --connection "$CONN" --confirm
sqlite3 "$CONN" < ./sql/verify_down.sql
