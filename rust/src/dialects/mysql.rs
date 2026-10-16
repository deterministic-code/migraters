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
    fn quote_ident(&self, ident: &str) -> String {
        format!("`{ident}`")
    }
}

#[cfg(test)]
mod tests {
    use super::MysqlDialect;
    use crate::abstractions::SqlDialect;
    use crate::dialects::assert_dialect_surface;

    #[test]
    fn surface() {
        let d = MysqlDialect;
        assert_dialect_surface(&d);
        assert_eq!(d.name(), "mysql");
        assert_eq!(d.connection_env_vars(), &["MYSQL_URL", "DATABASE_URL"]);
        assert!(!d.use_transaction());
        assert_eq!(
            d.normalize_connection("mysql://localhost/db"),
            "mysql://localhost/db"
        );
        assert!(d.prerequisite_error("mysql://localhost/db").is_none());
        d.prepare_setup("mysql://localhost/db").unwrap();
        assert!(d.insert_applied_sql().contains('?'));
        assert!(d.delete_applied_sql().contains('?'));
        assert_eq!(d.quote_ident("t"), "`t`");
        assert_eq!(d.now_expr(), "CURRENT_TIMESTAMP");
        assert_eq!(d.limit_clause(2), "LIMIT 2");
    }
}
