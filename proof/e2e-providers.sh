#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"

bash "$root/e2e-sqlite.sh"
bash "$root/e2e-postgres.sh"
bash "$root/e2e-mysql.sh"
bash "$root/e2e-sqlserver.sh"
bash "$root/e2e-oracle.sh"
