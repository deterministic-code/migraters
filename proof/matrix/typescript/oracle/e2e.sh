#!/usr/bin/env bash
set -euo pipefail
cd /app
export CONN="system/proof@oracle:1521/FREEPDB1"
npx migrate-setup --provider oracle --connection "$CONN"
npx migrate-up --provider oracle --connection "$CONN"
sqlplus -S system/proof@oracle:1521/FREEPDB1 < ./sql/verify_up.sql
npx migrate-down --provider oracle --connection "$CONN" --confirm
sqlplus -S system/proof@oracle:1521/FREEPDB1 < ./sql/verify_down.sql
