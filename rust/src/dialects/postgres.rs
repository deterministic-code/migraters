use crate::abstractions::SqlDialect;

pub struct PostgresDialect;

impl SqlDialect for PostgresDialect {
    fn name(&self) -> &'static str {
        "postgres"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["PG_CONNECTION_STRING", "DATABASE_URL"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../../shared/templates/sql/postgres/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../../shared/templates/sql/postgres/migrate_logs.sql")
    }
    fn use_transaction(&self) -> bool {
        true
    }
    fn insert_applied_sql(&self) -> &'static str {
        r#"INSERT INTO "migrates" ("name", "checksum") VALUES ($1, $2)"#
    }
    fn delete_applied_sql(&self) -> &'static str {
        r#"DELETE FROM "migrates" WHERE "name" = $1"#
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

#[cfg(test)]
mod tests {
    use super::PostgresDialect;
    use crate::abstractions::SqlDialect;
    use crate::dialects::assert_dialect_surface;

    #[test]
    fn surface() {
        let d = PostgresDialect;
        assert_dialect_surface(&d);
        assert_eq!(d.name(), "postgres");
        assert_eq!(
            d.connection_env_vars(),
            &["PG_CONNECTION_STRING", "DATABASE_URL"]
        );
        assert!(d.use_transaction());
        assert_eq!(
            d.normalize_connection("postgres://localhost/db"),
            "postgres://localhost/db"
        );
        assert!(d.prerequisite_error("postgres://localhost/db").is_none());
        d.prepare_setup("postgres://localhost/db").unwrap();
        assert!(d.insert_applied_sql().contains("$1"));
        assert!(d.delete_applied_sql().contains("$1"));
        assert_eq!(d.quote_ident("t"), "\"t\"");
        assert_eq!(d.now_expr(), "CURRENT_TIMESTAMP");
        assert_eq!(d.limit_clause(2), "LIMIT 2");
    }
}
