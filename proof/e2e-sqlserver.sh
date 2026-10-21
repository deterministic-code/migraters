#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

conn='Server=127.0.0.1,51433;User Id=sa;Password=Proof_Pass123;TrustServerCertificate=True;Encrypt=False;Database=proof'
migrate-setup --create-database --provider sqlserver --connection "$conn"
migrate-up --provider sqlserver --connection "$conn"
docker compose -f proof/docker-compose.yml exec -T sqlserver \
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P Proof_Pass123 -C -d proof -b -i /dev/stdin \
  < proof/sql/sqlserver/verify_up.sql
migrate-down --provider sqlserver --connection "$conn" --confirm
docker compose -f proof/docker-compose.yml exec -T sqlserver \
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P Proof_Pass123 -C -d proof -b -i /dev/stdin \
  < proof/sql/sqlserver/verify_down.sql
