-- psql "$CONN" -v ON_ERROR_STOP=1 -f sql/postgres/verify_up.sql
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM proof_widget WHERE id = 1 AND name = 'proof') <> 1 THEN
    RAISE EXCEPTION 'proof_widget row missing after migrate-up';
  END IF;
END $$;
