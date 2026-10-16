use crate::abstractions::SqlDialect;

pub struct SqlServerDialect;

impl SqlDialect for SqlServerDialect {
    fn name(&self) -> &'static str {
        "sqlserver"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["MSSQL_URL", "DATABASE_URL"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../../shared/templates/sql/sqlserver/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../../shared/templates/sql/sqlserver/migrate_logs.sql")
    }
    fn use_transaction(&self) -> bool {
        true
    }
    fn insert_applied_sql(&self) -> &'static str {
        r#"INSERT INTO [migrates] ([name], [checksum]) VALUES (@P1, @P2)"#
    }
    fn delete_applied_sql(&self) -> &'static str {
        r#"DELETE FROM [migrates] WHERE [name] = @P1"#
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
        format!("[{ident}]")
    }
    fn now_expr(&self) -> &'static str {
        "SYSUTCDATETIME()"
    }
    fn limit_clause(&self, n: usize) -> String {
        format!("OFFSET 0 ROWS FETCH NEXT {n} ROWS ONLY")
    }
}

#[cfg(test)]
mod tests {
    use super::SqlServerDialect;
    use crate::abstractions::SqlDialect;
    use crate::dialects::assert_dialect_surface;

    #[test]
    fn surface() {
        let d = SqlServerDialect;
        assert_dialect_surface(&d);
        assert_eq!(d.name(), "sqlserver");
        assert_eq!(d.connection_env_vars(), &["MSSQL_URL", "DATABASE_URL"]);
        assert!(d.use_transaction());
        assert_eq!(
            d.normalize_connection("Server=localhost"),
            "Server=localhost"
        );
        assert!(d.prerequisite_error("Server=localhost").is_none());
        d.prepare_setup("Server=localhost").unwrap();
        assert!(d.insert_applied_sql().contains("@P1"));
        assert!(d.delete_applied_sql().contains("@P1"));
        assert_eq!(d.quote_ident("t"), "[t]");
        assert_eq!(d.now_expr(), "SYSUTCDATETIME()");
        assert_eq!(d.limit_clause(4), "OFFSET 0 ROWS FETCH NEXT 4 ROWS ONLY");
    }
}
