use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

pub type BoxError = Box<dyn std::error::Error + Send + Sync + 'static>;

pub fn catalog_name(stored: &str) -> &str {
    stored.strip_suffix("_up.sql").unwrap_or(stored)
}

pub trait IDatasourceProvider: Send + Sync {
    fn name(&self) -> &'static str;
    fn connection_env_vars(&self) -> &'static [&'static str];
    fn normalize_connection(&self, connection: &str) -> String;
    fn prerequisite_error(&self, connection: &str) -> Option<String>;
    fn prepare_setup(&self, connection: &str) -> std::io::Result<()>;

    // SQL catalog text used by the locked rust/src/migrater.rs until that file can be thinned.
    fn migrates_ddl(&self) -> &'static str;
    fn migrate_logs_ddl(&self) -> &'static str;
    fn use_transaction(&self) -> bool;
    fn insert_applied_sql(&self) -> &'static str;
    fn delete_applied_sql(&self) -> &'static str;
    fn quote_ident(&self, ident: &str) -> String {
        format!("\"{ident}\"")
    }
    fn now_expr(&self) -> &'static str {
        "CURRENT_TIMESTAMP"
    }
    fn limit_clause(&self, n: usize) -> String {
        format!("LIMIT {n}")
    }
    fn select_applied_checksum_sql(&self) -> String {
        let name = self.quote_ident("name");
        let checksum = self.quote_ident("checksum");
        let table = self.quote_ident("migrates");
        format!("SELECT {name} AS name, {checksum} AS checksum FROM {table}")
    }

    fn connect<'a>(
        &'a self,
        connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Box<dyn MigrationDriver>, BoxError>> + Send + 'a>>;

    fn setup<'a>(
        &'a self,
        connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), BoxError>> + Send + 'a>> {
        Box::pin(async move {
            let driver = self.connect(connection).await?;
            driver.setup().await?;
            driver.close().await
        })
    }

    fn applied<'a>(
        &'a self,
        connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<HashMap<String, Option<String>>, BoxError>> + Send + 'a>>
    {
        Box::pin(async move {
            let driver = self.connect(connection).await?;
            let map = driver.applied().await?;
            driver.close().await?;
            Ok(map)
        })
    }

    fn migrate_up<'a>(
        &'a self,
        connection: &'a str,
        name: &'a str,
        body: &'a str,
        checksum: &'a str,
        batch_separator: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), BoxError>> + Send + 'a>> {
        Box::pin(async move {
            let driver = self.connect(connection).await?;
            driver
                .migrate_up(name, body, checksum, batch_separator)
                .await?;
            driver.close().await
        })
    }

    fn migrate_down<'a>(
        &'a self,
        connection: &'a str,
        name: &'a str,
        body: &'a str,
        batch_separator: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), BoxError>> + Send + 'a>> {
        Box::pin(async move {
            let driver = self.connect(connection).await?;
            driver.migrate_down(name, body, batch_separator).await?;
            driver.close().await
        })
    }

    fn log<'a>(
        &'a self,
        connection: &'a str,
        id: Option<i64>,
        name: &'a str,
        direction: &'a str,
        status: Option<&'a str>,
        duration_ms: i64,
        error: Option<&'a str>,
    ) -> Pin<Box<dyn Future<Output = Result<i64, BoxError>> + Send + 'a>> {
        Box::pin(async move {
            let driver = self.connect(connection).await?;
            let result = if let Some(id) = id {
                driver
                    .log_finished(id, status.unwrap_or("started"), duration_ms, error)
                    .await?;
                id
            } else {
                driver.log_started(name, direction).await?
            };
            driver.close().await?;
            Ok(result)
        })
    }

    fn create_database<'a>(
        &'a self,
        _connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), BoxError>> + Send + 'a>> {
        Box::pin(async { Ok(()) })
    }
}

pub use IDatasourceProvider as Dialect;
pub use IDatasourceProvider as SqlDialect;

#[async_trait::async_trait]
pub trait MigrationDriver: Send + Sync {
    async fn setup(&self) -> Result<(), BoxError>;
    async fn applied(&self) -> Result<HashMap<String, Option<String>>, BoxError>;
    async fn migrate_up(
        &self,
        name: &str,
        body: &str,
        checksum: &str,
        batch_separator: &str,
    ) -> Result<(), BoxError>;
    async fn migrate_down(
        &self,
        name: &str,
        body: &str,
        batch_separator: &str,
    ) -> Result<(), BoxError>;
    async fn log_started(&self, name: &str, direction: &str) -> Result<i64, BoxError>;
    async fn log_finished(
        &self,
        id: i64,
        status: &str,
        duration_ms: i64,
        error: Option<&str>,
    ) -> Result<(), BoxError>;
    async fn close(&self) -> Result<(), BoxError>;
}

pub struct DialectPlugin {
    pub dialect: &'static dyn IDatasourceProvider,
}

inventory::collect!(DialectPlugin);

pub fn registered_dialects() -> Vec<&'static dyn IDatasourceProvider> {
    inventory::iter::<DialectPlugin>
        .into_iter()
        .map(|p| p.dialect)
        .collect()
}

pub fn assert_dialect_surface(d: &dyn IDatasourceProvider) {
    assert!(!d.name().is_empty());
    assert!(!d.connection_env_vars().is_empty());
    assert!(d.migrates_ddl().to_ascii_lowercase().contains("migrates"));
    assert!(d
        .migrate_logs_ddl()
        .to_ascii_lowercase()
        .contains("migrate_logs"));
    assert!(!d.insert_applied_sql().is_empty());
    assert!(!d.delete_applied_sql().is_empty());
    assert!(!d.quote_ident("t").is_empty());
    assert!(!d.now_expr().is_empty());
    assert!(d.limit_clause(3).contains('3'));
    assert!(d
        .select_applied_checksum_sql()
        .to_ascii_lowercase()
        .contains("migrates"));
}
