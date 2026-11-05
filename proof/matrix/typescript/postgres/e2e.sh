#!/usr/bin/env bash
set -euo pipefail
cd /app
export CONN="postgresql://proof:proof@postgres:5432/proof"
npx migrate-setup --provider postgres --connection "$CONN"
npx migrate-up --provider postgres --connection "$CONN"
psql "$CONN" -v ON_ERROR_STOP=1 -f ./sql/verify_up.sql
npx migrate-down --provider postgres --connection "$CONN" --confirm
psql "$CONN" -v ON_ERROR_STOP=1 -f ./sql/verify_down.sql
