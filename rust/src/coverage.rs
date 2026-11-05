#![cfg(test)]

use std::collections::HashMap;
use async_trait::async_trait;
use migraters_api::{assert_dialect_surface, BoxError, IDatasourceProvider, MigrationDriver};

use crate::abstractions::{all, try_get};
use crate::argv::{is_help, take_value};
use crate::checksum::checksum_hex;
use crate::cli_spec::{
    env_var_list_separator, join_env_vars, parse_cli_from_for_test, provider_aliases, providers,
    usage_line,
};
use crate::help::fill_help_template;
use crate::infrastructure::{
    connection_from_env, create_database, is_batch_separator_line, split_on_go, MigrationPool,
};
use crate::messages::{fill_template, message, scaffold};
use crate::migrater::{CreateArg, DownArg, IMigrater, Migrater, SetupArg, UpArg};
use crate::migraters_config::{enabled_dialects, enabled_providers, find_path, parse_providers};
use crate::migrations::{
    assert_no_checksum_drift, catalog_name, discover_up_files, down_path_for, next_sequence,
    parse_sequence,
};
use crate::provider::{normalize_provider, strip_key};

pub(crate) fn cwd_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}
use migraters_api::DialectPlugin;

struct StaticSqlite;

impl IDatasourceProvider for StaticSqlite {
    fn name(&self) -> &'static str {
        "sqlite"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["SQLITE_PATH"]
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
        _connection: &'a str,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Box<dyn MigrationDriver>, BoxError>> + Send + 'a>,
    > {
        Box::pin(async { Ok(Box::new(Session {
            store: std::sync::Arc::new(Store::new()),
        }) as Box<dyn MigrationDriver>) })
    }
}

static STATIC_SQLITE: StaticSqlite = StaticSqlite;

inventory::submit! {
    DialectPlugin {
        dialect: &STATIC_SQLITE,
    }
}

struct Store {
    applied: std::sync::Mutex<HashMap<String, Option<String>>>,
    fail_up: std::sync::atomic::AtomicBool,
    fail_down: std::sync::atomic::AtomicBool,
    fail_applied: std::sync::atomic::AtomicBool,
    fail_log: std::sync::atomic::AtomicBool,
}

impl Store {
    fn new() -> Self {
        Self {
            applied: std::sync::Mutex::new(HashMap::new()),
            fail_up: std::sync::atomic::AtomicBool::new(false),
            fail_down: std::sync::atomic::AtomicBool::new(false),
            fail_applied: std::sync::atomic::AtomicBool::new(false),
            fail_log: std::sync::atomic::AtomicBool::new(false),
        }
    }
}

struct Session {
    store: std::sync::Arc<Store>,
}

#[async_trait]
impl MigrationDriver for Session {
    async fn setup(&self) -> Result<(), BoxError> {
        Ok(())
    }
    async fn applied(&self) -> Result<HashMap<String, Option<String>>, BoxError> {
        if self.store.fail_applied.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("applied".into());
        }
        Ok(self.store.applied.lock().unwrap().clone())
    }
    async fn migrate_up(
        &self,
        name: &str,
        body: &str,
        checksum: &str,
        _batch_separator: &str,
    ) -> Result<(), BoxError> {
        if self.store.fail_up.load(std::sync::atomic::Ordering::SeqCst) || body.contains("NOT VALID") {
            return Err("not valid sql".into());
        }
        self.store
            .applied
            .lock()
            .unwrap()
            .insert(name.to_string(), Some(checksum.to_string()));
        Ok(())
    }
    async fn migrate_down(
        &self,
        name: &str,
        _body: &str,
        _batch_separator: &str,
    ) -> Result<(), BoxError> {
        if self.store.fail_down.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("down failed".into());
        }
        self.store.applied.lock().unwrap().remove(name);
        Ok(())
    }
    async fn log_started(&self, _name: &str, _direction: &str) -> Result<i64, BoxError> {
        if self.store.fail_log.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("log".into());
        }
        Ok(1)
    }
    async fn log_finished(
        &self,
        _id: i64,
        _status: &str,
        _duration_ms: i64,
        _error: Option<&str>,
    ) -> Result<(), BoxError> {
        Ok(())
    }
    async fn close(&self) -> Result<(), BoxError> {
        Ok(())
    }
}

struct CoverDialect {
    store: std::sync::Arc<Store>,
}

impl IDatasourceProvider for CoverDialect {
    fn name(&self) -> &'static str {
        "sqlite"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["COVER_URL", "EMPTY_COVER"]
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
        _connection: &'a str,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Box<dyn MigrationDriver>, BoxError>> + Send + 'a>,
    > {
        let store = self.store.clone();
        Box::pin(async move { Ok(Box::new(Session { store }) as Box<dyn MigrationDriver>) })
    }
}

fn tmp(prefix: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "{prefix}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn argv_and_help_and_messages() {
    let mut iter = ["sqlite".to_string()].into_iter();
    assert_eq!(
        take_value("--provider", &mut iter, "--provider").as_deref(),
        Some("sqlite")
    );
    assert_eq!(
        take_value("--provider=pg", &mut std::iter::empty(), "--provider").as_deref(),
        Some("pg")
    );
    assert!(take_value("--other", &mut std::iter::empty(), "--provider").is_none());
    assert!(take_value("--provider", &mut std::iter::empty(), "--provider").is_none());
    assert!(is_help("-h"));
    assert!(is_help("--help"));
    assert!(!is_help("--provider"));
    let filled = fill_help_template("{{usage}}\n{{command}}", "migrate-up");
    assert!(filled.contains("Usage: migrate-up"));
    assert!(filled.contains("migrate-up"));
    assert_eq!(fill_template("{{a}}{{b}}", &[("a", "1"), ("b", "2")]), "12");
    for path in [
        "setup-complete",
        "status/no-pending",
        "status/no-more-pending",
        "status/applied",
        "status/created",
        "status/rolled-back",
        "status/no-rollback",
        "down/destructive-header",
        "down/confirm-mismatch",
        "down/confirm-tty-required",
        "down/confirm-prompt",
        "down/confirm-stdin-failed",
        "down/confirm-token-mismatch",
        "errors/missing-provider",
        "errors/missing-provider-hint",
        "errors/missing-connection",
        "errors/missing-name",
        "errors/missing-name-hint",
        "errors/invalid-name",
        "errors/unknown-arg",
        "errors/unsupported-provider",
        "errors/missing-value-for-flag",
        "errors/migrate-path-not-dir",
        "errors/rollback-no-down-sibling",
        "errors/rollback-not-in-path",
        "checksum-drift",
        "checksum-drift-line",
        "errors/sqlite-prerequisite",
    ] {
        assert!(!message(path, &[("name", "x"), ("dialect", "sqlite")]).is_empty());
    }
    assert!(scaffold("up", &[("name", "add_users")]).contains("add_users"));
    assert!(scaffold("down", &[("name", "add_users")]).contains("add_users"));
}

#[test]
#[should_panic(expected = "unknown message template")]
fn unknown_message_panics() {
    let _ = message("nope", &[]);
}

#[test]
#[should_panic(expected = "unknown scaffold template")]
fn unknown_scaffold_panics() {
    let _ = scaffold("sideways", &[]);
}

#[test]
#[should_panic(expected = "help command must be migrate-")]
fn help_requires_migrate_prefix() {
    let _ = fill_help_template("{{usage}}", "up");
}

#[test]
#[should_panic(expected = "missing command")]
fn usage_line_requires_verb() {
    let _ = usage_line("nope");
}

#[test]
fn cli_spec_and_provider_keys() {
    assert!(usage_line("init").contains("--language"));
    assert!(providers().contains(&"sqlite".to_string()));
    assert_eq!(provider_aliases().get("pg").map(String::as_str), Some("postgres"));
    assert_eq!(join_env_vars(&["A", "B"]), format!("A{sep}B", sep = env_var_list_separator()));
    assert_eq!(strip_key("MS SQL_Server"), "mssqlserver");
    assert_eq!(normalize_provider("sqlite"), Some("sqlite"));
    assert_eq!(normalize_provider("pg"), Some("postgres"));
    assert_eq!(normalize_provider("nope"), None);
    {
        let _guard = cwd_lock();
        let isolated = tmp("emptycfg");
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&isolated).unwrap();
        assert!(try_get("sqlite").is_none());
        assert!(all().is_empty());
        std::env::set_current_dir(prev).unwrap();
        let _ = std::fs::remove_dir_all(isolated);
    }
    assert_eq!(
        parse_cli_from_for_test(
            r#"
# comment

command: migrate-{verb}
env_var_list_separator: unquoted
providers:
- sqlite
  not-a-dash
languages:
- rust
  not-a-dash
provider_aliases:
  pg: postgres
  ---: skip
  blank: 
other:
  - ignored
commands:
  args:
    - {flag: --orphan, placeholder: languages, required: true}
    - flag: --lonely
      placeholder: n
      required: true
  - verb: setup
    args:
      leftover-before-flag: 1
      - {flag: --provider, placeholder: providers, required: true}
      - {flag: --x, no-colon}
      - {unknown: 1, required: false}
      - flag: --one
        placeholder: n
        required: true
  - verb: up
    args:
      - flag: --help
            leftover: 1
languages:
  rust
provider_aliases:
  nosplit
leftover_section: 1
commands:
  - verb: down
    args:
      - flag: --confirm
        required: false
flushed: 1
"#,
        ),
        3
    );
}

#[test]
fn config_walk_and_parse() {
    let root = tmp("cfg");
    let child = root.join("a").join("b");
    std::fs::create_dir_all(&child).unwrap();
    assert!(find_path(&child).is_none());
    std::fs::write(root.join(".migraters.yaml"), "providers:\n  - name: sqlite\n").unwrap();
    assert!(find_path(&child).is_some());
    assert!(enabled_providers().is_empty() || !enabled_dialects().is_empty() || enabled_dialects().is_empty());
    let _ = enabled_dialects();
    let _ = enabled_providers();
    assert_eq!(
        parse_providers("providers:\n  - name: sqlite\n    location: x\n\n  - name:\n  - extra\n  - name: postgres\nbinDir: x\n")
            .iter()
            .map(|p| p.name.as_str())
            .collect::<Vec<_>>(),
        ["sqlite", "postgres"]
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn migrations_and_checksum_edges() {
    assert_eq!(catalog_name("0001_init_up.sql"), "0001_init");
    assert_eq!(catalog_name("0001_init"), "0001_init");
    assert!(parse_sequence("init_up.sql").is_none());
    assert!(parse_sequence("0001init_up.sql").is_none());
    assert!(parse_sequence("00001_too_long_up.sql").is_none());
    assert_eq!(parse_sequence("12_ok_up.sql"), Some(12));
    assert_eq!(next_sequence(["0003_later_up.sql", "0001_init_up.sql"]), 4);
    let dir = tmp("disc");
    std::fs::create_dir_all(dir.join("nested")).unwrap();
    std::fs::write(dir.join("0002_later_up.sql"), "-- 2\n").unwrap();
    std::fs::write(dir.join("0001_init_up.sql"), "-- 1\n").unwrap();
    std::fs::write(dir.join("notes.txt"), "x").unwrap();
    let found = discover_up_files(dir.to_str().unwrap()).unwrap();
    assert_eq!(
        found.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>(),
        ["0001_init", "0002_later"]
    );
    assert!(down_path_for(dir.to_str().unwrap(), "0001_init").is_none());
    let mut applied = HashMap::new();
    applied.insert("0001_init".into(), None);
    assert_no_checksum_drift(&found, &applied).unwrap();
    applied.insert("0001_init".into(), Some("short".into()));
    assert!(assert_no_checksum_drift(&found, &applied).is_err());
    std::env::set_var("MIGRATE_ALLOW_CHECKSUM_DRIFT", "1");
    assert_no_checksum_drift(&found, &applied).unwrap();
    std::env::remove_var("MIGRATE_ALLOW_CHECKSUM_DRIFT");
    let headed = format!(
        "// deterministic-content-hash: {}\nSELECT 1;\n",
        "b".repeat(64)
    );
    assert_eq!(checksum_hex(&headed), checksum_hex("SELECT 1;\n"));
    assert_eq!(
        checksum_hex(&format!("# deterministic-content-hash: {}\nX", "c".repeat(64))),
        checksum_hex("X")
    );
    assert_eq!(checksum_hex("-- not-a-hash\nX"), checksum_hex("-- not-a-hash\nX"));
    assert_eq!(checksum_hex("").len(), 64);
    assert_eq!(
        checksum_hex(&format!("-- deterministic-content-hash: {}\nY", "g".repeat(63))),
        checksum_hex(&format!("-- deterministic-content-hash: {}\nY", "g".repeat(63)))
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn split_on_go_edges() {
    assert!(!is_batch_separator_line("", "GO"));
    assert!(!is_batch_separator_line("SELECT 1", "GO"));
    assert!(is_batch_separator_line("GO 2026-10-29", "GO"));
    assert!(!is_batch_separator_line("GO 2026-10-29 extra", "GO"));
    assert!(!is_batch_separator_line("GO not-date", "GO"));
    assert!(split_on_go("GO\n\nGO").is_empty());
    assert_eq!(split_on_go("SELECT 1;\nGO 2026-10-29"), vec!["SELECT 1;".to_string()]);
}

#[tokio::test]
async fn connection_and_create_database() {
    std::env::remove_var("COVER_URL");
    std::env::set_var("EMPTY_COVER", "");
    let dialect = CoverDialect {
        store: std::sync::Arc::new(Store::new()),
    };
    assert!(connection_from_env(&dialect).is_none());
    std::env::set_var("COVER_URL", "from-env");
    assert_eq!(connection_from_env(&dialect).as_deref(), Some("from-env"));
    std::env::remove_var("COVER_URL");
    create_database("dbase", "x").await.unwrap();
    let _guard = cwd_lock();
    let isolated = tmp("enabled");
    std::fs::write(isolated.join(".migraters.yaml"), "providers:\n  - name: sqlite\n").unwrap();
    let prev = std::env::current_dir().unwrap();
    std::env::set_current_dir(&isolated).unwrap();
    create_database("sqlite", "x").await.unwrap();
    assert!(try_get("sqlite").is_some());
    assert!(!all().is_empty());
    std::env::set_current_dir(prev).unwrap();
    let _ = std::fs::remove_dir_all(isolated);
}

#[test]
fn enabled_unknown_provider_panics() {
    let _guard = cwd_lock();
    let isolated = tmp("ghost");
    std::fs::write(isolated.join(".migraters.yaml"), "providers:\n  - name: ghost\n").unwrap();
    let prev = std::env::current_dir().unwrap();
    std::env::set_current_dir(&isolated).unwrap();
    let result = std::panic::catch_unwind(|| {
        let _ = all();
    });
    std::env::set_current_dir(prev).unwrap();
    let _ = std::fs::remove_dir_all(isolated);
    assert!(result.is_err());
}

#[tokio::test]
async fn migrater_and_pool_paths() {
    let dir = tmp("mig");
    let migrations = dir.join("migrations");
    let store = std::sync::Arc::new(Store::new());
    let dialect = Box::leak(Box::new(CoverDialect { store: store.clone() }));
    let migrater = Migrater::with_batch_separator(dialect, "GO");
    assert_eq!(migrater.name(), "sqlite");
    assert!(migrater
        .create(CreateArg {
            name: "Bad",
            migrations_path: migrations.to_str().unwrap(),
        })
        .is_err());
    migrater
        .setup(SetupArg {
            connection: "c",
            migrations_path: migrations.to_str().unwrap(),
        })
        .await
        .unwrap();
    let created = migrater
        .create(CreateArg {
            name: "init",
            migrations_path: migrations.to_str().unwrap(),
        })
        .unwrap();
    assert_eq!(created.up_name, "0001_init_up.sql");
    let second = migrater
        .create(CreateArg {
            name: "later",
            migrations_path: migrations.to_str().unwrap(),
        })
        .unwrap();
    assert_eq!(second.up_name, "0002_later_up.sql");
    std::fs::write(migrations.join("0001_init_up.sql"), "CREATE TABLE t (id INT);\n").unwrap();
    std::fs::remove_file(migrations.join("0001_init_down.sql")).unwrap();
    std::fs::write(migrations.join("0002_next_up.sql"), "CREATE TABLE u (id INT);\n").unwrap();
    std::fs::write(migrations.join("0002_next_down.sql"), "DROP TABLE u;\n").unwrap();
    let one = migrater
        .up(UpArg {
            connection: "c",
            migrations_path: migrations.to_str().unwrap(),
            one: true,
        })
        .await
        .unwrap();
    assert_eq!(one, vec!["0001_init".to_string()]);
    assert!(migrater
        .down(DownArg {
            connection: "c",
            migrations_path: migrations.to_str().unwrap(),
        })
        .await
        .is_err());
    std::fs::write(migrations.join("0001_init_down.sql"), "DROP TABLE t;\n").unwrap();
    store.fail_down.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(migrater
        .down(DownArg {
            connection: "c",
            migrations_path: migrations.to_str().unwrap(),
        })
        .await
        .is_err());
    store.fail_down.store(false, std::sync::atomic::Ordering::SeqCst);
    assert_eq!(
        migrater
            .down(DownArg {
                connection: "c",
                migrations_path: migrations.to_str().unwrap(),
            })
            .await
            .unwrap()
            .as_deref(),
        Some("0001_init")
    );
    assert!(migrater
        .down(DownArg {
            connection: "c",
            migrations_path: migrations.to_str().unwrap(),
        })
        .await
        .unwrap()
        .is_none());
    let ghost = dir.join("ghost");
    std::fs::create_dir_all(&ghost).unwrap();
    std::fs::write(ghost.join("0009_other_up.sql"), "SELECT 1;\n").unwrap();
    store
        .applied
        .lock()
        .unwrap()
        .insert("0001_init".into(), Some("x".into()));
    std::env::set_var("MIGRATE_ALLOW_CHECKSUM_DRIFT", "1");
    assert!(migrater
        .down(DownArg {
            connection: "c",
            migrations_path: ghost.to_str().unwrap(),
        })
        .await
        .is_err());
    std::env::remove_var("MIGRATE_ALLOW_CHECKSUM_DRIFT");
    let pool = MigrationPool::connect(dialect, "c").await.unwrap();
    pool.setup().await.unwrap();
    pool.execute("SELECT 1").await.unwrap();
    pool.execute("SELECT 1").await.unwrap();
    let _ = pool.applied().await.unwrap();
    let _ = pool.fetch_applied("SELECT").await.unwrap();
    store.applied.lock().unwrap().clear();
    pool.migrate_up("one", "CREATE TABLE t (id INT);", "sum")
        .await
        .unwrap();
    pool.apply_statements(dialect, "SELECT 1", "INSERT INTO migrates", "one", Some("sum"))
        .await
        .unwrap();
    pool.apply_statements(dialect, "SELECT 1", "DELETE FROM migrates", "one", None)
        .await
        .unwrap();
    pool.migrate_down("one", "DROP TABLE t;").await.unwrap();
    let id = pool.log_started("one", "up").await.unwrap();
    pool.insert_log_started(dialect, "one", "up").await.unwrap();
    pool.update_log(dialect, id, "success", 1, None).await.unwrap();
    pool.log_finished(id, "error", 1, Some("boom")).await.unwrap();
    assert_dialect_surface(dialect);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn write_non_utf8_name_is_skipped_in_create() {
    let dir = tmp("nonutf");
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        let path = dir.join(std::ffi::OsString::from_vec(vec![0xff, 0xfe]));
        let _ = std::fs::File::create(&path);
    }
    let store = std::sync::Arc::new(Store::new());
    let dialect = Box::leak(Box::new(CoverDialect { store }));
    let created = Migrater::new(dialect)
        .create(CreateArg {
            name: "add_users",
            migrations_path: dir.to_str().unwrap(),
        })
        .unwrap();
    assert_eq!(created.up_name, "0001_add_users_up.sql");
    let _ = std::fs::remove_dir_all(dir);
}

struct FailPrep;

impl IDatasourceProvider for FailPrep {
    fn name(&self) -> &'static str {
        "oracle"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["ORACLE_CONNECT_STRING"]
    }
    fn migrates_ddl(&self) -> &'static str {
        "CREATE TABLE migrates (name TEXT)"
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        "CREATE TABLE migrate_logs (id INTEGER)"
    }
    fn use_transaction(&self) -> bool {
        false
    }
    fn insert_applied_sql(&self) -> &'static str {
        "INSERT"
    }
    fn delete_applied_sql(&self) -> &'static str {
        "DELETE"
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
        _connection: &'a str,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Box<dyn MigrationDriver>, BoxError>> + Send + 'a>,
    > {
        Box::pin(async { Err("connect".into()) })
    }
    fn create_database<'a>(
        &'a self,
        _connection: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), BoxError>> + Send + 'a>> {
        Box::pin(async { Err("createdb".into()) })
    }
}

static FAIL_PREP: FailPrep = FailPrep;

inventory::submit! {
    DialectPlugin {
        dialect: &FAIL_PREP,
    }
}

#[tokio::test]
async fn migrater_maps_provider_errors() {
    let dir = tmp("failprep");
    let migrater = Migrater::new(&FAIL_PREP);
    assert!(migrater
        .setup(SetupArg {
            connection: "c",
            migrations_path: dir.to_str().unwrap(),
        })
        .await
        .is_err());
    let _guard = cwd_lock();
    let isolated = tmp("failcreate");
    std::fs::write(isolated.join(".migraters.yaml"), "providers:\n  - name: oracle\n").unwrap();
    let prev = std::env::current_dir().unwrap();
    std::env::set_current_dir(&isolated).unwrap();
    assert!(create_database("oracle", "c").await.is_err());
    std::env::set_current_dir(prev).unwrap();
    let store = std::sync::Arc::new(Store::new());
    let dialect = Box::leak(Box::new(CoverDialect { store: store.clone() }));
    let pool = MigrationPool::connect(dialect, "c").await.unwrap();
    store.fail_up.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(pool.migrate_up("n", "NOT VALID", "s").await.is_err());
    store.fail_down.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(pool.migrate_down("n", "x").await.is_err());
    store.fail_down.store(false, std::sync::atomic::Ordering::SeqCst);
    let fail_pool = MigrationPool::connect(&FAIL_PREP, "c").await.unwrap();
    assert!(fail_pool.setup().await.is_err());
    assert!(fail_pool.execute("SELECT 1").await.is_err());
    assert!(fail_pool.applied().await.is_err());
    assert!(fail_pool.log_started("n", "up").await.is_err());
    assert!(fail_pool.log_finished(1, "error", 1, Some("e")).await.is_err());
    assert!(fail_pool
        .apply_statements(&FAIL_PREP, "SELECT 1", "INSERT", "n", Some("s"))
        .await
        .is_err());
    std::fs::write(dir.join("0001_init_up.sql"), "SELECT 1;\n").unwrap();
    assert!(migrater
        .up(crate::migrater::UpArg {
            connection: "c",
            migrations_path: dir.to_str().unwrap(),
            one: false,
        })
        .await
        .is_err());
    let as_file = dir.join("not-a-dir");
    std::fs::write(&as_file, "x").unwrap();
    assert!(migrater
        .setup(SetupArg {
            connection: "c",
            migrations_path: as_file.to_str().unwrap(),
        })
        .await
        .is_err());
    let _ = std::fs::remove_dir_all(dir);
    let _ = std::fs::remove_dir_all(isolated);
}

#[tokio::test]
async fn migrater_applied_and_log_errors() {
    let dir = tmp("maperr");
    std::fs::write(dir.join("0001_init_up.sql"), "SELECT 1;\n").unwrap();
    std::fs::write(dir.join("0001_init_down.sql"), "SELECT 1;\n").unwrap();
    let store = std::sync::Arc::new(Store::new());
    let dialect = Box::leak(Box::new(CoverDialect { store: store.clone() }));
    let migrater = Migrater::new(dialect);
    store.fail_applied.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(migrater
        .up(UpArg {
            connection: "c",
            migrations_path: dir.to_str().unwrap(),
            one: false,
        })
        .await
        .is_err());
    assert!(migrater
        .down(DownArg {
            connection: "c",
            migrations_path: dir.to_str().unwrap(),
        })
        .await
        .is_err());
    store.fail_applied.store(false, std::sync::atomic::Ordering::SeqCst);
    store
        .applied
        .lock()
        .unwrap()
        .insert("0001_init".into(), Some("drifted".repeat(8)));
    assert!(migrater
        .up(UpArg {
            connection: "c",
            migrations_path: dir.to_str().unwrap(),
            one: false,
        })
        .await
        .is_err());
    assert!(migrater
        .down(DownArg {
            connection: "c",
            migrations_path: dir.to_str().unwrap(),
        })
        .await
        .is_err());
    store.applied.lock().unwrap().clear();
    store.fail_log.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(migrater
        .up(UpArg {
            connection: "c",
            migrations_path: dir.to_str().unwrap(),
            one: false,
        })
        .await
        .is_err());
    store
        .applied
        .lock()
        .unwrap()
        .insert("0001_init".into(), Some("x".into()));
    std::env::set_var("MIGRATE_ALLOW_CHECKSUM_DRIFT", "1");
    assert!(migrater
        .down(DownArg {
            connection: "c",
            migrations_path: dir.to_str().unwrap(),
        })
        .await
        .is_err());
    std::env::remove_var("MIGRATE_ALLOW_CHECKSUM_DRIFT");
    store.fail_log.store(false, std::sync::atomic::Ordering::SeqCst);
    let mut files = discover_up_files(dir.to_str().unwrap()).unwrap();
    let mut applied = HashMap::new();
    applied.insert("0001_init".into(), Some("x".repeat(64)));
    std::fs::remove_file(dir.join("0001_init_up.sql")).unwrap();
    assert!(assert_no_checksum_drift(&files, &applied).is_err());
    files.clear();
    assert_no_checksum_drift(&files, &applied).unwrap();
    assert!(parse_sequence("12ok_up.sql").is_none());
    assert!(parse_sequence("0001_init_down.sql").is_none());
    let blocked = tmp("blockdown");
    std::fs::create_dir_all(blocked.join("0001_add_users_down.sql")).unwrap();
    let block_store = std::sync::Arc::new(Store::new());
    let block_dialect = Box::leak(Box::new(CoverDialect { store: block_store }));
    assert!(Migrater::new(block_dialect)
        .create(CreateArg {
            name: "add_users",
            migrations_path: blocked.to_str().unwrap(),
        })
        .is_err());
    let _ = std::fs::remove_dir_all(blocked);
    assert_eq!(
        checksum_hex(&format!("-- deterministic-content-hash: {}\nZ", "g".repeat(64))),
        checksum_hex(&format!("-- deterministic-content-hash: {}\nZ", "g".repeat(64)))
    );
    assert!(is_batch_separator_line("GO -- note", "GO"));
    let _guard = cwd_lock();
    let isolated = tmp("both");
    std::fs::write(
        isolated.join(".migraters.yaml"),
        "providers:\n  - name: sqlite\n  - name: oracle\n",
    )
    .unwrap();
    let prev = std::env::current_dir().unwrap();
    std::env::set_current_dir(&isolated).unwrap();
    let names: Vec<&str> = all().iter().map(|d| d.name()).collect();
    assert!(names.contains(&"sqlite"));
    assert!(names.contains(&"oracle"));
    assert!(try_get("pg").is_none());
    std::env::set_current_dir(prev).unwrap();
    let gone = tmp("gone");
    std::env::set_current_dir(&gone).unwrap();
    std::fs::remove_dir_all(&gone).unwrap();
    let _ = enabled_providers();
    let _ = std::env::set_current_dir(std::env::temp_dir());
    let unread = tmp("unread");
    std::fs::write(unread.join(".migraters.yaml"), "providers:\n  - name: sqlite\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(unread.join(".migraters.yaml"), std::fs::Permissions::from_mode(0o000)).unwrap();
    }
    std::env::set_current_dir(&unread).unwrap();
    let _ = enabled_providers();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(unread.join(".migraters.yaml"), std::fs::Permissions::from_mode(0o644)).unwrap();
    }
    std::env::set_current_dir(std::env::temp_dir()).unwrap();
    let _ = std::fs::remove_dir_all(dir);
    let _ = std::fs::remove_dir_all(isolated);
    let _ = std::fs::remove_dir_all(unread);
}

struct FailPrepare;

impl IDatasourceProvider for FailPrepare {
    fn name(&self) -> &'static str {
        "sqlserver"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["SQLSERVER_URL"]
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
    fn normalize_connection(&self, connection: &str) -> String {
        connection.to_string()
    }
    fn prerequisite_error(&self, _connection: &str) -> Option<String> {
        None
    }
    fn prepare_setup(&self, _connection: &str) -> std::io::Result<()> {
        Err(std::io::Error::other("prep"))
    }
    fn connect<'a>(
        &'a self,
        _connection: &'a str,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Box<dyn MigrationDriver>, BoxError>> + Send + 'a>,
    > {
        Box::pin(async { Ok(Box::new(Session { store: std::sync::Arc::new(Store::new()) }) as Box<dyn MigrationDriver>) })
    }
}

static FAIL_PREPARE: FailPrepare = FailPrepare;

#[tokio::test]
async fn io_error_branches() {
    let store = std::sync::Arc::new(Store::new());
    let dialect = Box::leak(Box::new(CoverDialect { store: store.clone() }));
    let migrater = Migrater::new(dialect);
    assert!(Migrater::new(&FAIL_PREPARE)
        .setup(SetupArg {
            connection: "c",
            migrations_path: "/tmp",
        })
        .await
        .is_err());
    let dir = tmp("ioerr");
    let as_file = dir.join("file");
    std::fs::write(&as_file, "x").unwrap();
    assert!(migrater
        .setup(SetupArg {
            connection: "c",
            migrations_path: as_file.to_str().unwrap(),
        })
        .await
        .is_err());
    assert!(migrater
        .up(UpArg {
            connection: "c",
            migrations_path: as_file.to_str().unwrap(),
            one: false,
        })
        .await
        .is_err());
    assert!(migrater
        .down(DownArg {
            connection: "c",
            migrations_path: as_file.to_str().unwrap(),
        })
        .await
        .is_err());
    assert!(migrater
        .create(CreateArg {
            name: "add_users",
            migrations_path: as_file.to_str().unwrap(),
        })
        .is_err());
    std::fs::write(dir.join("0001_init_up.sql"), "SELECT 1;\n").unwrap();
    std::fs::write(dir.join("0001_init_down.sql"), "SELECT 1;\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir.join("0001_init_up.sql"), std::fs::Permissions::from_mode(0o000)).unwrap();
        assert!(migrater
            .up(UpArg {
                connection: "c",
                migrations_path: dir.to_str().unwrap(),
                one: false,
            })
            .await
            .is_err());
        std::fs::set_permissions(dir.join("0001_init_up.sql"), std::fs::Permissions::from_mode(0o644)).unwrap();
        store
            .applied
            .lock()
            .unwrap()
            .insert("0001_init".into(), Some("x".into()));
        std::env::set_var("MIGRATE_ALLOW_CHECKSUM_DRIFT", "1");
        std::fs::set_permissions(dir.join("0001_init_down.sql"), std::fs::Permissions::from_mode(0o000)).unwrap();
        assert!(migrater
            .down(DownArg {
                connection: "c",
                migrations_path: dir.to_str().unwrap(),
            })
            .await
            .is_err());
        std::fs::set_permissions(dir.join("0001_init_down.sql"), std::fs::Permissions::from_mode(0o644)).unwrap();
        std::env::remove_var("MIGRATE_ALLOW_CHECKSUM_DRIFT");
        let locked = tmp("locked");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o555)).unwrap();
        assert!(migrater
            .create(CreateArg {
                name: "add_users",
                migrations_path: locked.to_str().unwrap(),
            })
            .is_err());
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(discover_up_files(locked.to_str().unwrap()).is_ok());
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
        assert!(discover_up_files(locked.to_str().unwrap()).is_err());
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
        let unread_dir = tmp("readdir");
        std::fs::set_permissions(&unread_dir, std::fs::Permissions::from_mode(0o000)).unwrap();
        assert!(migrater
            .create(CreateArg {
                name: "add_users",
                migrations_path: unread_dir.to_str().unwrap(),
            })
            .is_err());
        std::fs::set_permissions(&unread_dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        let _ = std::fs::remove_dir_all(unread_dir);
        let _ = std::fs::remove_dir_all(locked);
    }
    let _ = std::fs::remove_dir_all(dir);
}
