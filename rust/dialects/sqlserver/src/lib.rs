use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use async_trait::async_trait;
use migraters_api::{catalog_name, BoxError, Dialect, DialectPlugin, MigrationDriver};
use migraters_sql::{SqlDriver, SqlSession};
use tiberius::{Client, Config};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

type MssqlClient = Client<Compat<TcpStream>>;

pub struct SqlServerDialect;

pub static SQLSERVER: SqlServerDialect = SqlServerDialect;

inventory::submit! {
    DialectPlugin { dialect: &SQLSERVER }
}

impl Dialect for SqlServerDialect {
    fn name(&self) -> &'static str {
        "sqlserver"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["MSSQL_URL", "DATABASE_URL"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../../../shared/templates/sql/sqlserver/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../../../shared/templates/sql/sqlserver/migrate_logs.sql")
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
    fn connect<'a>(
        &'a self,
        connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Box<dyn MigrationDriver>, BoxError>> + Send + 'a>> {
        Box::pin(async move {
            let url = self.normalize_connection(connection);
            let config = Config::from_ado_string(&url)
                .or_else(|_| Config::from_jdbc_string(&url))
                .map_err(|e| -> BoxError { e.into() })?;
            let tcp = TcpStream::connect(config.get_addr()).await?;
            tcp.set_nodelay(true)?;
            let client = Client::connect(config, tcp.compat_write()).await?;
            Ok(Box::new(SqlDriver::wrap(
                SqlServerSession {
                    client: Mutex::new(client),
                },
                &SQLSERVER,
            )) as Box<dyn MigrationDriver>)
        })
    }
    fn create_database<'a>(
        &'a self,
        connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), BoxError>> + Send + 'a>> {
        Box::pin(async move { create_database(connection).await })
    }
}

struct SqlServerSession {
    client: Mutex<MssqlClient>,
}

#[async_trait]
impl SqlSession for SqlServerSession {
    async fn execute(&self, sql: &str) -> Result<(), BoxError> {
        let mut c = self.client.lock().await;
        c.execute(sql, &[]).await?;
        Ok(())
    }

    async fn fetch_applied(&self, sql: &str) -> Result<HashMap<String, Option<String>>, BoxError> {
        let mut out = HashMap::new();
        let mut c = self.client.lock().await;
        let stream = c.query(sql, &[]).await?;
        let rows = stream.into_first_result().await?;
        for row in rows {
            let name: &str = row.get(0).ok_or("missing migrates.name")?;
            let checksum: Option<&str> = row.get(1);
            out.insert(catalog_name(name).to_string(), checksum.map(str::to_string));
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
        let mut c = self.client.lock().await;
        c.simple_query("BEGIN TRAN").await?;
        let result = async {
            for stmt in stmts {
                c.execute(stmt.as_str(), &[]).await?;
            }
            mssql_catalog(&mut c, catalog_sql, p1, p2).await
        }
        .await;
        match result {
            Ok(()) => {
                c.simple_query("COMMIT").await?;
                Ok(())
            }
            Err(e) => {
                let _ = c.simple_query("ROLLBACK").await;
                Err(e)
            }
        }
    }

    async fn catalog_write(
        &self,
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError> {
        let mut c = self.client.lock().await;
        mssql_catalog(&mut c, catalog_sql, p1, p2).await
    }

    async fn fetch_id(&self, sql: &str, p1: &str, p2: &str) -> Result<i64, BoxError> {
        let mut c = self.client.lock().await;
        let stream = c.query(sql, &[&p1 as &dyn tiberius::ToSql, &p2]).await?;
        let row = stream.into_row().await?.ok_or("missing migrate_logs id")?;
        Ok(row.get::<i64, usize>(0).ok_or("missing migrate_logs id")?)
    }

    async fn update_log_exec(
        &self,
        sql: &str,
        status: &str,
        duration_ms: i64,
        error_message: Option<&str>,
        id: i64,
    ) -> Result<(), BoxError> {
        let mut c = self.client.lock().await;
        let err = error_message.unwrap_or("");
        c.execute(sql, &[&status, &duration_ms, &err, &id]).await?;
        Ok(())
    }
}

async fn mssql_catalog(
    client: &mut MssqlClient,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), BoxError> {
    if let Some(p2) = p2 {
        client.execute(sql, &[&p1, &p2]).await?;
    } else {
        client.execute(sql, &[&p1]).await?;
    }
    Ok(())
}

async fn create_database(connection: &str) -> Result<(), BoxError> {
    let Some(name) = connection.split(';').find_map(|part| {
        let (k, v) = part.split_once('=')?;
        k.eq_ignore_ascii_case("Database").then_some(v)
    }) else {
        return Ok(());
    };
    if name.eq_ignore_ascii_case("master") {
        return Ok(());
    }
    let admin = connection.replace(&format!("Database={name}"), "Database=master");
    let config = Config::from_ado_string(&admin)
        .or_else(|_| Config::from_jdbc_string(&admin))?;
    let tcp = TcpStream::connect(config.get_addr()).await?;
    tcp.set_nodelay(true)?;
    let mut client = Client::connect(config, tcp.compat_write()).await?;
    let sql = format!(
        "IF DB_ID(N'{}') IS NULL CREATE DATABASE [{}]",
        name.replace('\'', "''"),
        name
    );
    client.simple_query(sql).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::SqlServerDialect;
    use migraters_api::{assert_dialect_surface, Dialect};

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
