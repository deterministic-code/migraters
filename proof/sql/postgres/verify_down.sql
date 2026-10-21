-- psql "$CONN" -v ON_ERROR_STOP=1 -f sql/postgres/verify_down.sql
DO $$
BEGIN
  IF to_regclass('public.proof_widget') IS NOT NULL THEN
    RAISE EXCEPTION 'proof_widget still exists after migrate-down';
  END IF;
END $$;
