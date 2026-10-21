-- sqlite3 ./app.sqlite < sql/sqlite/verify_down.sql
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'proof_widget')
  THEN RAISE(ABORT, 'proof_widget still exists after migrate-down')
  ELSE 1
END;
