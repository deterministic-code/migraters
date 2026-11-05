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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::Mutex;

    const OK: u8 = 0;
    const FAIL_CONNECT: u8 = 1;
    const FAIL_OPS: u8 = 2;
    const FAIL_CLOSE: u8 = 3;

    struct Driver {
        mode: u8,
    }

    #[async_trait::async_trait]
    impl MigrationDriver for Driver {
        async fn setup(&self) -> Result<(), BoxError> {
            if self.mode == FAIL_OPS {
                return Err("setup".into());
            }
            Ok(())
        }
        async fn applied(&self) -> Result<HashMap<String, Option<String>>, BoxError> {
            if self.mode == FAIL_OPS {
                return Err("applied".into());
            }
            Ok(HashMap::new())
        }
        async fn migrate_up(
            &self,
            _name: &str,
            _body: &str,
            _checksum: &str,
            _batch_separator: &str,
        ) -> Result<(), BoxError> {
            if self.mode == FAIL_OPS {
                return Err("up".into());
            }
            Ok(())
        }
        async fn migrate_down(
            &self,
            _name: &str,
            _body: &str,
            _batch_separator: &str,
        ) -> Result<(), BoxError> {
            if self.mode == FAIL_OPS {
                return Err("down".into());
            }
            Ok(())
        }
        async fn log_started(&self, _name: &str, _direction: &str) -> Result<i64, BoxError> {
            if self.mode == FAIL_OPS {
                return Err("log".into());
            }
            Ok(7)
        }
        async fn log_finished(
            &self,
            _id: i64,
            _status: &str,
            _duration_ms: i64,
            _error: Option<&str>,
        ) -> Result<(), BoxError> {
            if self.mode == FAIL_OPS {
                return Err("logf".into());
            }
            Ok(())
        }
        async fn close(&self) -> Result<(), BoxError> {
            if self.mode == FAIL_CLOSE {
                return Err("close".into());
            }
            Ok(())
        }
    }

    struct Fake {
        mode: AtomicU8,
    }

    impl Fake {
        fn set(&self, mode: u8) {
            self.mode.store(mode, Ordering::SeqCst);
        }
    }

    impl IDatasourceProvider for Fake {
        fn name(&self) -> &'static str {
            "fake"
        }
        fn connection_env_vars(&self) -> &'static [&'static str] {
            &["FAKE_URL"]
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
        fn migrates_ddl(&self) -> &'static str {
            "CREATE TABLE migrates (name TEXT)"
        }
        fn migrate_logs_ddl(&self) -> &'static str {
            "CREATE TABLE migrate_logs (id INTEGER)"
        }
        fn use_transaction(&self) -> bool {
            true
        }
        fn insert_applied_sql(&self) -> &'static str {
            "INSERT"
        }
        fn delete_applied_sql(&self) -> &'static str {
            "DELETE"
        }
        fn connect<'a>(
            &'a self,
            _connection: &'a str,
        ) -> Pin<Box<dyn Future<Output = Result<Box<dyn MigrationDriver>, BoxError>> + Send + 'a>>
        {
            let mode = self.mode.load(Ordering::SeqCst);
            Box::pin(async move {
                if mode == FAIL_CONNECT {
                    return Err("nope".into());
                }
                Ok(Box::new(Driver { mode }) as Box<dyn MigrationDriver>)
            })
        }
    }

    static FAKE: Fake = Fake {
        mode: AtomicU8::new(OK),
    };

    #[test]
    fn catalog_name_strips_suffix() {
        assert_eq!(catalog_name("0001_init_up.sql"), "0001_init");
        assert_eq!(catalog_name("0001_init"), "0001_init");
    }

    #[test]
    fn surface_and_registered_plugins() {
        assert_dialect_surface(&FAKE);
        assert_eq!(FAKE.normalize_connection("c"), "c");
        assert!(FAKE.prerequisite_error("c").is_none());
        FAKE.prepare_setup("c").unwrap();
        assert!(FAKE.use_transaction());
        let _ = registered_dialects();
        let _ = Mutex::new(DialectPlugin { dialect: &FAKE });
    }

    #[tokio::test]
    async fn default_trait_methods() {
        FAKE.set(OK);
        FAKE.setup("c").await.unwrap();
        assert!(FAKE.applied("c").await.unwrap().is_empty());
        FAKE.migrate_up("c", "n", "sql", "sum", "GO").await.unwrap();
        FAKE.migrate_down("c", "n", "sql", "GO").await.unwrap();
        assert_eq!(FAKE.log("c", None, "n", "up", None, 0, None).await.unwrap(), 7);
        assert_eq!(
            FAKE.log("c", Some(3), "n", "up", None, 1, Some("e"))
                .await
                .unwrap(),
            3
        );
        FAKE.create_database("c").await.unwrap();
        assert_eq!(
            FAKE.log("c", Some(1), "n", "up", None, 0, None).await.unwrap(),
            1
        );
        FAKE.set(FAIL_CONNECT);
        assert!(FAKE.setup("c").await.is_err());
        assert!(FAKE.applied("c").await.is_err());
        assert!(FAKE.migrate_up("c", "n", "s", "h", "GO").await.is_err());
        assert!(FAKE.migrate_down("c", "n", "s", "GO").await.is_err());
        assert!(FAKE.log("c", None, "n", "up", None, 0, None).await.is_err());
        assert!(FAKE.log("c", Some(1), "n", "up", Some("e"), 0, None).await.is_err());
        FAKE.set(FAIL_OPS);
        assert!(FAKE.setup("c").await.is_err());
        assert!(FAKE.applied("c").await.is_err());
        assert!(FAKE.migrate_up("c", "n", "s", "h", "GO").await.is_err());
        assert!(FAKE.migrate_down("c", "n", "s", "GO").await.is_err());
        assert!(FAKE.log("c", None, "n", "up", None, 0, None).await.is_err());
        assert!(FAKE.log("c", Some(1), "n", "up", Some("e"), 0, None).await.is_err());
        FAKE.set(FAIL_CLOSE);
        assert!(FAKE.setup("c").await.is_err());
        assert!(FAKE.applied("c").await.is_err());
        assert!(FAKE.migrate_up("c", "n", "s", "h", "GO").await.is_err());
        assert!(FAKE.migrate_down("c", "n", "s", "GO").await.is_err());
        assert!(FAKE.log("c", None, "n", "up", None, 0, None).await.is_err());
        assert!(FAKE.log("c", Some(1), "n", "up", Some("e"), 0, None).await.is_err());
        FAKE.set(OK);
    }
}
