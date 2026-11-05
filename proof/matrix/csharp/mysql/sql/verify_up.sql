-- mysql --protocol=TCP -h 127.0.0.1 -P 53306 -uroot -pproof proof < sql/mysql/verify_up.sql
SET @n = (SELECT COUNT(*) FROM proof_widget WHERE id = 1 AND name = 'proof');
SET @sql = IF(
  @n = 1,
  'DO 0',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''proof_widget row missing after migrate-up'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
