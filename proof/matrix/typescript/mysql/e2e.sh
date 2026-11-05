#!/usr/bin/env bash
set -euo pipefail
cd /app
export CONN="mysql://root:proof@mysql:3306/proof"
npx migrate-setup --provider mysql --connection "$CONN"
npx migrate-up --provider mysql --connection "$CONN"
mysql -h mysql -uroot -pproof proof < ./sql/verify_up.sql
npx migrate-down --provider mysql --connection "$CONN" --confirm
mysql -h mysql -uroot -pproof proof < ./sql/verify_down.sql
