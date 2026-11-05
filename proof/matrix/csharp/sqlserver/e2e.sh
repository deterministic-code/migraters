#!/usr/bin/env bash
set -euo pipefail
cd /app
export CONN="Server=sqlserver,1433;User Id=sa;Password=Proof_Pass123;TrustServerCertificate=True;Encrypt=False;Database=proof"
npx migrate-setup --create-database --provider sqlserver --connection "$CONN"
npx migrate-up --provider sqlserver --connection "$CONN"
sqlcmd -S sqlserver -U sa -P Proof_Pass123 -C -d proof -b -i ./sql/verify_up.sql
npx migrate-down --provider sqlserver --connection "$CONN" --confirm
sqlcmd -S sqlserver -U sa -P Proof_Pass123 -C -d proof -b -i ./sql/verify_down.sql
