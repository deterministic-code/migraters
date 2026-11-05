-- mysql --protocol=TCP -h 127.0.0.1 -P 53306 -uroot -pproof proof < sql/mysql/verify_down.sql
SET @n = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'proof_widget'
);
SET @sql = IF(
  @n = 0,
  'DO 0',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''proof_widget still exists after migrate-down'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
