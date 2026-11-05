-- sqlite3 ./app.sqlite < sql/sqlite/verify_up.sql
CREATE TEMP TABLE _proof_check (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _proof_check
SELECT CASE
  WHEN (SELECT COUNT(*) FROM proof_widget WHERE id = 1 AND name = 'proof') = 1 THEN 1
  ELSE 0
END;
