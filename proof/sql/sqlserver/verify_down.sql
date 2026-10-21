-- sqlcmd -S 127.0.0.1,51433 -U sa -P Proof_Pass123 -C -d proof -b -i sql/sqlserver/verify_down.sql
IF OBJECT_ID(N'dbo.proof_widget', N'U') IS NOT NULL
  THROW 50000, 'proof_widget still exists after migrate-down', 1;
