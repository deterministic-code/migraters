-- sqlite3 ./app.sqlite < sql/sqlite/verify_down.sql
CREATE TEMP TABLE _proof_check (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _proof_check
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'proof_widget') THEN 0
  ELSE 1
END;
