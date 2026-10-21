use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

pub type BoxError = Box<dyn std::error::Error + Send + Sync + 'static>;

pub fn catalog_name(stored: &str) -> &str {
    stored.strip_suffix("_up.sql").unwrap_or(stored)
}

pub trait SqlDialect: Send + Sync {
    fn name(&self) -> &'static str;
    fn connection_env_vars(&self) -> &'static [&'static str];
    fn migrates_ddl(&self) -> &'static str;
    fn migrate_logs_ddl(&self) -> &'static str;
    fn use_transaction(&self) -> bool;
    fn insert_applied_sql(&self) -> &'static str;
    fn delete_applied_sql(&self) -> &'static str;
    fn normalize_connection(&self, connection: &str) -> String;
    fn prerequisite_error(&self, connection: &str) -> Option<String>;
    fn prepare_setup(&self, connection: &str) -> std::io::Result<()>;

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
    ) -> Pin<Box<dyn Future<Output = Result<Box<dyn MigrationSession>, BoxError>> + Send + 'a>>;

    fn create_database<'a>(
        &'a self,
        _connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), BoxError>> + Send + 'a>> {
        Box::pin(async { Ok(()) })
    }
}

#[async_trait::async_trait]
pub trait MigrationSession: Send + Sync {
    async fn execute(&self, sql: &str) -> Result<(), BoxError>;
    async fn fetch_applied(&self, sql: &str) -> Result<HashMap<String, Option<String>>, BoxError>;
    async fn apply_in_transaction(
        &self,
        stmts: &[String],
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError>;
    async fn catalog_write(
        &self,
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError>;
    async fn fetch_id(&self, sql: &str, p1: &str, p2: &str) -> Result<i64, BoxError>;
    async fn update_log_exec(
        &self,
        sql: &str,
        status: &str,
        duration_ms: i64,
        error_message: Option<&str>,
        id: i64,
    ) -> Result<(), BoxError>;
}

pub struct DialectPlugin {
    pub dialect: &'static dyn SqlDialect,
}

inventory::collect!(DialectPlugin);

pub fn registered_dialects() -> Vec<&'static dyn SqlDialect> {
    inventory::iter::<DialectPlugin>
        .into_iter()
        .map(|p| p.dialect)
        .collect()
}

pub fn register_try_get(
    name: &str,
    normalize: impl Fn(&str) -> Option<&str>,
) -> Option<&'static dyn SqlDialect> {
    let key = normalize(name)?;
    registered_dialects()
        .into_iter()
        .find(|d| d.name() == key)
}

pub fn split_on_go(sql: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    for line in sql.replace("\r\n", "\n").split('\n') {
        if line.trim().eq_ignore_ascii_case("GO") {
            let s = buf.trim();
            if !s.is_empty() {
                out.push(s.to_string());
            }
            buf.clear();
            continue;
        }
        if !buf.is_empty() {
            buf.push('\n');
        }
        buf.push_str(line);
    }
    let tail = buf.trim();
    if !tail.is_empty() {
        out.push(tail.to_string());
    }
    out
}

pub fn placeholders(dialect: &str, n: usize) -> Vec<String> {
    match dialect {
        "postgres" => (1..=n).map(|i| format!("${i}")).collect(),
        "sqlserver" => (1..=n).map(|i| format!("@P{i}")).collect(),
        "oracle" => (1..=n).map(|i| format!(":{i}")).collect(),
        _ => (0..n).map(|_| "?".into()).collect(),
    }
}

pub async fn apply_statements(
    session: &dyn MigrationSession,
    dialect: &dyn SqlDialect,
    sql: &str,
    catalog_sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), BoxError> {
    let stmts = split_on_go(sql);
    if dialect.use_transaction() {
        session
            .apply_in_transaction(&stmts, catalog_sql, p1, p2)
            .await
    } else {
        for stmt in &stmts {
            session.execute(stmt).await?;
        }
        session.catalog_write(catalog_sql, p1, p2).await
    }
}

pub async fn insert_log_started(
    session: &dyn MigrationSession,
    dialect: &dyn SqlDialect,
    name: &str,
    direction: &str,
) -> Result<i64, BoxError> {
    let t = dialect.quote_ident("migrate_logs");
    let migrate_name = dialect.quote_ident("migrate_name");
    let dir_col = dialect.quote_ident("direction");
    let status = dialect.quote_ident("status");
    let id_col = dialect.quote_ident("id");
    let ph = placeholders(dialect.name(), 2);
    let insert = format!(
        "INSERT INTO {t} ({migrate_name}, {dir_col}, {status}) VALUES ({}, {}, 'started')",
        ph[0], ph[1]
    );
    session
        .catalog_write(&insert, name, Some(direction))
        .await?;
    let select = format!(
        "SELECT {id_col} AS id FROM {t} WHERE {migrate_name} = {} AND {dir_col} = {} ORDER BY {id_col} DESC {}",
        ph[0],
        ph[1],
        dialect.limit_clause(1)
    );
    session.fetch_id(&select, name, direction).await
}

pub async fn update_log(
    session: &dyn MigrationSession,
    dialect: &dyn SqlDialect,
    id: i64,
    status: &str,
    duration_ms: i64,
    error_message: Option<&str>,
) -> Result<(), BoxError> {
    let t = dialect.quote_ident("migrate_logs");
    let now = dialect.now_expr();
    let ph = placeholders(dialect.name(), 4);
    let sql = format!(
        "UPDATE {t} SET {status_col} = {p1}, {finished} = {now}, {duration} = {p2}, {err} = {p3}, {updated} = {now} WHERE {id_col} = {p4}",
        status_col = dialect.quote_ident("status"),
        finished = dialect.quote_ident("finished_at"),
        duration = dialect.quote_ident("duration_ms"),
        err = dialect.quote_ident("error_message"),
        updated = dialect.quote_ident("updated"),
        id_col = dialect.quote_ident("id"),
        p1 = ph[0],
        p2 = ph[1],
        p3 = ph[2],
        p4 = ph[3],
    );
    session
        .update_log_exec(&sql, status, duration_ms, error_message, id)
        .await
}

pub fn assert_dialect_surface(d: &dyn SqlDialect) {
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
