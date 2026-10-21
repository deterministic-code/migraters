-- sqlcmd -S 127.0.0.1,51433 -U sa -P Proof_Pass123 -C -d proof -b -i sql/sqlserver/verify_up.sql
IF (SELECT COUNT(*) FROM proof_widget WHERE id = 1 AND name = N'proof') <> 1
  THROW 50000, 'proof_widget row missing after migrate-up', 1;
