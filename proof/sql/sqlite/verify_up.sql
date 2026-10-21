-- sqlite3 ./app.sqlite < sql/sqlite/verify_up.sql
SELECT CASE
  WHEN (SELECT COUNT(*) FROM proof_widget WHERE id = 1 AND name = 'proof') = 1 THEN 1
  ELSE RAISE(ABORT, 'proof_widget row missing after migrate-up')
END;
