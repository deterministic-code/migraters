use crate::abstractions::SqlDialect;

pub struct MysqlDialect;

impl SqlDialect for MysqlDialect {
    fn name(&self) -> &'static str {
        "mysql"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["MYSQL_URL", "DATABASE_URL"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../../shared/templates/sql/mysql/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../../shared/templates/sql/mysql/migrate_logs.sql")
    }
    fn use_transaction(&self) -> bool {
        false
    }
    fn select_applied_sql(&self) -> &'static str {
        "SELECT `name` FROM `migrates`"
    }
    fn select_last_applied_sql(&self) -> &'static str {
        "SELECT `name` FROM `migrates` ORDER BY `name` DESC LIMIT 1"
    }
    fn insert_applied_sql(&self) -> &'static str {
        "INSERT INTO `migrates` (`name`, `checksum`) VALUES (?, ?)"
    }
    fn delete_applied_sql(&self) -> &'static str {
        "DELETE FROM `migrates` WHERE `name` = ?"
    }
    fn normalize_connection(&self, connection: &str) -> String {
        connection.to_string()
    }
    fn prerequisite_error(&self, _connection: &str) -> Option<String> {
        None
    }
    fn prepare_setup(&self, _connection: &str) -> std::io::Result<()> {
        Ok(())
    }
}
