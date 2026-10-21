-- sqlplus -S proof/proof@127.0.0.1:51521/FREEPDB1 @sql/oracle/verify_down.sql
WHENEVER SQLERROR EXIT FAILURE
DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_tables WHERE table_name = 'PROOF_WIDGET';
  IF n <> 0 THEN
    RAISE_APPLICATION_ERROR(-20002, 'proof_widget still exists after migrate-down');
  END IF;
END;
/
EXIT
