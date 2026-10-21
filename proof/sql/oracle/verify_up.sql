-- sqlplus -S proof/proof@127.0.0.1:51521/FREEPDB1 @sql/oracle/verify_up.sql
WHENEVER SQLERROR EXIT FAILURE
DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM proof_widget WHERE id = 1 AND name = 'proof';
  IF n <> 1 THEN
    RAISE_APPLICATION_ERROR(-20001, 'proof_widget row missing after migrate-up');
  END IF;
END;
/
EXIT
