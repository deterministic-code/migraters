use crate::abstractions::SqlDialect;

pub struct OracleDialect;

pub fn parse_oracle_connection(connection: &str) -> Result<(String, String, String), String> {
    let Some((user, rest)) = connection.split_once('/') else {
        return Err("Oracle connection must look like user/password@connectString".into());
    };
    let Some((password, connect_string)) = rest.split_once('@') else {
        return Err("Oracle connection must look like user/password@connectString".into());
    };
    if user.is_empty() || password.is_empty() || connect_string.is_empty() {
        return Err("Oracle connection must look like user/password@connectString".into());
    }
    Ok((
        user.to_string(),
        password.to_string(),
        connect_string.to_string(),
    ))
}

impl SqlDialect for OracleDialect {
    fn name(&self) -> &'static str {
        "oracle"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["ORACLE_CONNECT_STRING", "DATABASE_URL"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../../shared/templates/sql/oracle/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../../shared/templates/sql/oracle/migrate_logs.sql")
    }
    fn use_transaction(&self) -> bool {
        true
    }
    fn select_applied_sql(&self) -> &'static str {
        r#"SELECT "name" FROM "migrates""#
    }
    fn select_last_applied_sql(&self) -> &'static str {
        r#"SELECT "name" FROM "migrates" ORDER BY "name" DESC FETCH FIRST 1 ROWS ONLY"#
    }
    fn insert_applied_sql(&self) -> &'static str {
        r#"INSERT INTO "migrates" ("name", "checksum") VALUES (:1, :2)"#
    }
    fn delete_applied_sql(&self) -> &'static str {
        r#"DELETE FROM "migrates" WHERE "name" = :1"#
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
    fn limit_clause(&self, n: usize) -> String {
        format!("FETCH FIRST {n} ROWS ONLY")
    }
}
