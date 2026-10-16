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
