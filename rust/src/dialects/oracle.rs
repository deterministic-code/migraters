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

#[cfg(test)]
mod tests {
    use super::{parse_oracle_connection, OracleDialect};
    use crate::abstractions::SqlDialect;
    use crate::dialects::assert_dialect_surface;

    #[test]
    fn surface() {
        let d = OracleDialect;
        assert_dialect_surface(&d);
        assert_eq!(d.name(), "oracle");
        assert_eq!(
            d.connection_env_vars(),
            &["ORACLE_CONNECT_STRING", "DATABASE_URL"]
        );
        assert!(d.use_transaction());
        assert_eq!(d.normalize_connection("u/p@c"), "u/p@c");
        assert!(d.prerequisite_error("u/p@c").is_none());
        d.prepare_setup("u/p@c").unwrap();
        assert!(d.insert_applied_sql().contains(":1"));
        assert!(d.delete_applied_sql().contains(":1"));
        assert_eq!(d.quote_ident("t"), "\"t\"");
        assert_eq!(d.now_expr(), "CURRENT_TIMESTAMP");
        assert_eq!(d.limit_clause(5), "FETCH FIRST 5 ROWS ONLY");
    }

    #[test]
    fn parse_oracle_connection_accepts_user_password_connect() {
        assert_eq!(
            parse_oracle_connection("scott/tiger@localhost/orcl").unwrap(),
            (
                "scott".to_string(),
                "tiger".to_string(),
                "localhost/orcl".to_string()
            )
        );
    }

    #[test]
    fn parse_oracle_connection_rejects_malformed() {
        let msg = "Oracle connection must look like user/password@connectString";
        for bad in ["not-a-dsn", "user/nohost", "/p@c", "u/@c", "u/p@"] {
            let err = parse_oracle_connection(bad).unwrap_err();
            assert_eq!(err, msg, "{bad}");
        }
    }
}
