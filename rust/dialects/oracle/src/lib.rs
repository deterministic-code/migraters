use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex as StdMutex;

use async_trait::async_trait;
use migraters_api::{catalog_name, BoxError, DialectPlugin, MigrationSession, SqlDialect};
use oracle::Connection as OracleConn;

pub struct OracleDialect;

pub static ORACLE: OracleDialect = OracleDialect;

inventory::submit! {
    DialectPlugin { dialect: &ORACLE }
}

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

fn init_oracle_client() -> Result<(), BoxError> {
    let Ok(dir) = std::env::var("ORACLE_CLIENT_LIB_DIR") else {
        return Ok(());
    };
    if dir.is_empty() {
        return Ok(());
    }
    oracle::InitParams::new()
        .oracle_client_lib_dir(dir)?
        .init()?;
    Ok(())
}

impl SqlDialect for OracleDialect {
    fn name(&self) -> &'static str {
        "oracle"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["ORACLE_CONNECT_STRING", "DATABASE_URL"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../../../shared/templates/sql/oracle/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../../../shared/templates/sql/oracle/migrate_logs.sql")
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
    fn connect<'a>(
        &'a self,
        connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Box<dyn MigrationSession>, BoxError>> + Send + 'a>> {
        Box::pin(async move {
            let url = self.normalize_connection(connection);
            let (user, password, connect_string) = parse_oracle_connection(&url)?;
            init_oracle_client()?;
            let conn = tokio::task::spawn_blocking(move || {
                OracleConn::connect(user, password, connect_string)
            })
            .await??;
            Ok(Box::new(OracleSession {
                conn: StdMutex::new(conn),
            }) as Box<dyn MigrationSession>)
        })
    }
}

struct OracleSession {
    conn: StdMutex<OracleConn>,
}

#[async_trait]
impl MigrationSession for OracleSession {
    async fn execute(&self, sql: &str) -> Result<(), BoxError> {
        let sql = sql.to_string();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(&sql, &[])?;
        Ok(())
    }

    async fn fetch_applied(&self, sql: &str) -> Result<HashMap<String, Option<String>>, BoxError> {
        let mut out = HashMap::new();
        let sql = sql.to_string();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rows = conn.query(&sql, &[])?;
        for row in rows {
            let row = row?;
            let name: String = row.get(0)?;
            let checksum: Option<String> = row.get(1).ok();
            out.insert(catalog_name(&name).to_string(), checksum);
        }
        Ok(out)
    }

    async fn apply_in_transaction(
        &self,
        stmts: &[String],
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let result: Result<(), BoxError> = (|| {
            for stmt in stmts {
                conn.execute(stmt, &[])?;
            }
            oracle_catalog(&conn, catalog_sql, p1, p2)?;
            conn.commit()?;
            Ok(())
        })();
        if result.is_err() {
            let _ = conn.rollback();
        }
        result
    }

    async fn catalog_write(
        &self,
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        oracle_catalog(&conn, catalog_sql, p1, p2)
    }

    async fn fetch_id(&self, sql: &str, p1: &str, p2: &str) -> Result<i64, BoxError> {
        let sql = sql.to_string();
        let p1 = p1.to_string();
        let p2 = p2.to_string();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let row = conn.query_row(&sql, &[&p1, &p2])?;
        Ok(row.get::<usize, i64>(0)?)
    }

    async fn update_log_exec(
        &self,
        sql: &str,
        status: &str,
        duration_ms: i64,
        error_message: Option<&str>,
        id: i64,
    ) -> Result<(), BoxError> {
        let sql = sql.to_string();
        let status = status.to_string();
        let err = error_message.map(str::to_string);
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(&sql, &[&status, &duration_ms, &err, &id])?;
        Ok(())
    }
}

fn oracle_catalog(
    conn: &OracleConn,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), BoxError> {
    if let Some(p2) = p2 {
        conn.execute(sql, &[&p1, &p2])?;
    } else {
        conn.execute(sql, &[&p1])?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_oracle_connection, OracleDialect};
    use migraters_api::{assert_dialect_surface, SqlDialect};

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
