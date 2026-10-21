mod attached_dialects;
pub mod abstractions;
pub mod argv;
pub mod checksum;
pub mod cli_spec;
pub mod help;
pub mod infrastructure;
pub mod messages;
pub mod migrater;
pub mod migrations;
pub mod provider;

pub use abstractions::{all, try_get, SqlDialect};
pub use argv::{is_help, take_value};
pub use checksum::checksum_hex;
pub use cli_spec::join_env_vars;
pub use help::fill_help_template;
pub use infrastructure::{connection_from_env, create_database, MigrationPool};
pub use messages::{fill_template, message, scaffold};
pub use migrater::{CreateArg, CreateResponse, DownArg, IMigrater, Migrater, SetupArg, UpArg};
pub use migrations::{
    assert_no_checksum_drift, catalog_name, discover_up_files, down_path_for, is_migration_name,
    next_sequence,
};

#[cfg(test)]
mod api_yaml {
    const RAW: &str = include_str!("../../api.yaml");

    #[test]
    fn lists_imigrater() {
        assert!(RAW.contains("interface: IMigrater"));
        for method in ["setup", "up", "down", "create"] {
            assert!(
                RAW.contains(&format!("  - {method}")),
                "api.yaml missing method {method}"
            );
        }
    }
}

#[cfg(test)]
mod core_lifecycle {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    use async_trait::async_trait;
    use migraters_api::{BoxError, MigrationSession, SqlDialect};

    use crate::checksum::checksum_hex;
    use crate::infrastructure::MigrationPool;
    use crate::migrater::{CreateArg, DownArg, IMigrater, Migrater, SetupArg, UpArg};

    struct Store {
        applied: Mutex<HashMap<String, Option<String>>>,
        next_id: Mutex<i64>,
    }

    impl Store {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                applied: Mutex::new(HashMap::new()),
                next_id: Mutex::new(1),
            })
        }
    }

    fn store_for(connection: &str) -> Arc<Store> {
        use std::sync::OnceLock;
        static STORES: OnceLock<Mutex<HashMap<String, Arc<Store>>>> = OnceLock::new();
        let map = STORES.get_or_init(|| Mutex::new(HashMap::new()));
        let mut locked = map.lock().unwrap();
        locked
            .entry(connection.to_string())
            .or_insert_with(Store::new)
            .clone()
    }

    struct CoreSession {
        store: Arc<Store>,
    }

    #[async_trait]
    impl MigrationSession for CoreSession {
        async fn execute(&self, sql: &str) -> Result<(), BoxError> {
            if sql.contains("NOT VALID") {
                return Err("not valid sql".into());
            }
            Ok(())
        }

        async fn fetch_applied(&self, _sql: &str) -> Result<HashMap<String, Option<String>>, BoxError> {
            Ok(self.store.applied.lock().unwrap().clone())
        }

        async fn apply_in_transaction(
            &self,
            stmts: &[String],
            catalog_sql: &str,
            p1: &str,
            p2: Option<&str>,
        ) -> Result<(), BoxError> {
            for stmt in stmts {
                self.execute(stmt).await?;
            }
            self.catalog_write(catalog_sql, p1, p2).await
        }

        async fn catalog_write(
            &self,
            catalog_sql: &str,
            p1: &str,
            p2: Option<&str>,
        ) -> Result<(), BoxError> {
            let upper = catalog_sql.to_ascii_uppercase();
            if upper.contains("DELETE") && upper.contains("MIGRATES") {
                self.store.applied.lock().unwrap().remove(p1);
            } else if upper.contains("INSERT") && upper.contains("MIGRATES") {
                self.store
                    .applied
                    .lock()
                    .unwrap()
                    .insert(p1.to_string(), p2.map(str::to_string));
            }
            Ok(())
        }

        async fn fetch_id(&self, _sql: &str, _p1: &str, _p2: &str) -> Result<i64, BoxError> {
            let mut next = self.store.next_id.lock().unwrap();
            let id = *next;
            *next += 1;
            Ok(id)
        }

        async fn update_log_exec(
            &self,
            _sql: &str,
            _status: &str,
            _duration_ms: i64,
            _error_message: Option<&str>,
            _id: i64,
        ) -> Result<(), BoxError> {
            Ok(())
        }
    }

    struct CoreDialect;

    impl SqlDialect for CoreDialect {
        fn name(&self) -> &'static str {
            "core"
        }
        fn connection_env_vars(&self) -> &'static [&'static str] {
            &["CORE_URL"]
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
            r#"INSERT INTO "migrates" ("name", "checksum") VALUES (?, ?)"#
        }
        fn delete_applied_sql(&self) -> &'static str {
            r#"DELETE FROM "migrates" WHERE "name" = ?"#
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
        fn connect<'a>(
            &'a self,
            connection: &'a str,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<Box<dyn MigrationSession>, BoxError>> + Send + 'a>,
        > {
            let store = store_for(connection);
            Box::pin(async move { Ok(Box::new(CoreSession { store }) as Box<dyn MigrationSession>) })
        }
    }

    static CORE: CoreDialect = CoreDialect;

    #[tokio::test]
    async fn setup_apply_applied_rollback() {
        let dir = std::env::temp_dir().join(format!(
            "migraters-core-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let connection = dir.to_str().unwrap();
        let migrations_path = dir.join("migrations");
        let migrater = Migrater::new(&CORE);
        migrater
            .setup(SetupArg {
                connection,
                migrations_path: migrations_path.to_str().unwrap(),
            })
            .await
            .unwrap();
        let created = migrater
            .create(CreateArg {
                name: "init",
                migrations_path: migrations_path.to_str().unwrap(),
            })
            .unwrap();
        assert_eq!(created.up_name, "0001_init_up.sql");
        let sql = "CREATE TABLE t (id INTEGER);\n";
        std::fs::write(migrations_path.join("0001_init_up.sql"), sql).unwrap();
        std::fs::write(
            migrations_path.join("0001_init_down.sql"),
            "DROP TABLE t;\n",
        )
        .unwrap();
        let names = migrater
            .up(UpArg {
                connection,
                migrations_path: migrations_path.to_str().unwrap(),
                one: false,
            })
            .await
            .unwrap();
        assert_eq!(names, vec!["0001_init".to_string()]);
        let pool = MigrationPool::connect(&CORE, connection).await.unwrap();
        let applied = pool
            .fetch_applied(&CORE.select_applied_checksum_sql())
            .await
            .unwrap();
        assert_eq!(
            applied.get("0001_init").cloned().flatten().as_deref(),
            Some(checksum_hex(sql).as_str())
        );
        let again = migrater
            .up(UpArg {
                connection,
                migrations_path: migrations_path.to_str().unwrap(),
                one: false,
            })
            .await
            .unwrap();
        assert!(again.is_empty());
        let rolled = migrater
            .down(DownArg {
                connection,
                migrations_path: migrations_path.to_str().unwrap(),
            })
            .await
            .unwrap();
        assert_eq!(rolled.as_deref(), Some("0001_init"));
        let applied = pool
            .fetch_applied(&CORE.select_applied_checksum_sql())
            .await
            .unwrap();
        assert!(!applied.contains_key("0001_init"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn up_rethrows_invalid_sql() {
        let dir = std::env::temp_dir().join(format!(
            "migraters-core-fail-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let connection = format!("{}-fail", dir.display());
        let migrations_path = dir.join("migrations");
        let migrater = Migrater::new(&CORE);
        migrater
            .setup(SetupArg {
                connection: &connection,
                migrations_path: migrations_path.to_str().unwrap(),
            })
            .await
            .unwrap();
        std::fs::write(migrations_path.join("0001_init_up.sql"), "NOT VALID SQL;\n").unwrap();
        std::fs::write(migrations_path.join("0001_init_down.sql"), "SELECT 1;\n").unwrap();
        let err = migrater
            .up(UpArg {
                connection: &connection,
                migrations_path: migrations_path.to_str().unwrap(),
                one: false,
            })
            .await
            .unwrap_err();
        assert!(err.to_string().contains("not valid sql"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
