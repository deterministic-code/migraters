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
    fn select_applied_sql(&self) -> &'static str {
        r#"SELECT "name" FROM "migrates""#
    }
    fn select_last_applied_sql(&self) -> &'static str {
        r#"SELECT "name" FROM "migrates" ORDER BY "name" DESC LIMIT 1"#
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
