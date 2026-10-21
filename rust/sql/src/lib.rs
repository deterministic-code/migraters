use std::collections::HashMap;

use async_trait::async_trait;
use migraters_api::{catalog_name, BoxError, Dialect, MigrationDriver};

#[async_trait]
pub trait SqlSession: Send + Sync {
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

struct SqlKnobs {
    name: String,
    migrates_ddl: String,
    migrate_logs_ddl: String,
    use_transaction: bool,
    insert_applied_sql: String,
    delete_applied_sql: String,
    select_applied: String,
    quote_ident: fn(&str) -> String,
    now_expr: String,
    limit_clause: fn(usize) -> String,
}

impl SqlKnobs {
    fn from_dialect(d: &dyn Dialect) -> Self {
        Self {
            name: d.name().to_string(),
            migrates_ddl: d.migrates_ddl().to_string(),
            migrate_logs_ddl: d.migrate_logs_ddl().to_string(),
            use_transaction: d.use_transaction(),
            insert_applied_sql: d.insert_applied_sql().to_string(),
            delete_applied_sql: d.delete_applied_sql().to_string(),
            select_applied: d.select_applied_checksum_sql(),
            quote_ident: match d.name() {
                "mysql" => |ident: &str| format!("`{ident}`"),
                "sqlserver" => |ident: &str| format!("[{ident}]"),
                _ => |ident: &str| format!("\"{ident}\""),
            },
            now_expr: d.now_expr().to_string(),
            limit_clause: match d.name() {
                "sqlserver" => |n: usize| format!("OFFSET 0 ROWS FETCH NEXT {n} ROWS ONLY"),
                "oracle" => |n: usize| format!("FETCH FIRST {n} ROWS ONLY"),
                _ => |n: usize| format!("LIMIT {n}"),
            },
        }
    }
}

pub struct SqlDriver {
    session: Box<dyn SqlSession>,
    knobs: SqlKnobs,
}

impl SqlDriver {
    pub fn wrap(session: impl SqlSession + 'static, dialect: &dyn Dialect) -> Self {
        Self {
            session: Box::new(session),
            knobs: SqlKnobs::from_dialect(dialect),
        }
    }
}

#[async_trait]
impl MigrationDriver for SqlDriver {
    async fn setup(&self) -> Result<(), BoxError> {
        self.session.execute(&self.knobs.migrates_ddl).await?;
        self.session.execute(&self.knobs.migrate_logs_ddl).await
    }

    async fn applied(&self) -> Result<HashMap<String, Option<String>>, BoxError> {
        self.session.fetch_applied(&self.knobs.select_applied).await
    }

    async fn migrate_up(&self, name: &str, body: &str, checksum: &str) -> Result<(), BoxError> {
        apply_statements(
            &*self.session,
            self.knobs.use_transaction,
            body,
            &self.knobs.insert_applied_sql,
            name,
            Some(checksum),
        )
        .await
    }

    async fn migrate_down(&self, name: &str, body: &str) -> Result<(), BoxError> {
        apply_statements(
            &*self.session,
            self.knobs.use_transaction,
            body,
            &self.knobs.delete_applied_sql,
            name,
            None,
        )
        .await
    }

    async fn log_started(&self, name: &str, direction: &str) -> Result<i64, BoxError> {
        insert_log_started(&*self.session, &self.knobs, name, direction).await
    }

    async fn log_finished(
        &self,
        id: i64,
        status: &str,
        duration_ms: i64,
        error: Option<&str>,
    ) -> Result<(), BoxError> {
        update_log(&*self.session, &self.knobs, id, status, duration_ms, error).await
    }

    async fn close(&self) -> Result<(), BoxError> {
        Ok(())
    }
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
    session: &dyn SqlSession,
    use_transaction: bool,
    sql: &str,
    catalog_sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), BoxError> {
    let stmts = split_on_go(sql);
    if use_transaction {
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

async fn insert_log_started(
    session: &dyn SqlSession,
    knobs: &SqlKnobs,
    name: &str,
    direction: &str,
) -> Result<i64, BoxError> {
    let q = knobs.quote_ident;
    let t = q("migrate_logs");
    let ph = placeholders(&knobs.name, 2);
    let insert = format!(
        "INSERT INTO {t} ({}, {}, {}) VALUES ({}, {}, 'started')",
        q("migrate_name"),
        q("direction"),
        q("status"),
        ph[0],
        ph[1]
    );
    session
        .catalog_write(&insert, name, Some(direction))
        .await?;
    let select = format!(
        "SELECT {} AS id FROM {t} WHERE {} = {} AND {} = {} ORDER BY {} DESC {}",
        q("id"),
        q("migrate_name"),
        ph[0],
        q("direction"),
        ph[1],
        q("id"),
        (knobs.limit_clause)(1)
    );
    session.fetch_id(&select, name, direction).await
}

async fn update_log(
    session: &dyn SqlSession,
    knobs: &SqlKnobs,
    id: i64,
    status: &str,
    duration_ms: i64,
    error_message: Option<&str>,
) -> Result<(), BoxError> {
    let q = knobs.quote_ident;
    let t = q("migrate_logs");
    let now = &knobs.now_expr;
    let ph = placeholders(&knobs.name, 4);
    let sql = format!(
        "UPDATE {t} SET {} = {}, {} = {now}, {} = {}, {} = {}, {} = {now} WHERE {} = {}",
        q("status"),
        ph[0],
        q("finished_at"),
        q("duration_ms"),
        ph[1],
        q("error_message"),
        ph[2],
        q("updated"),
        q("id"),
        ph[3],
    );
    session
        .update_log_exec(&sql, status, duration_ms, error_message, id)
        .await
}

pub fn applied_name(stored: &str) -> String {
    catalog_name(stored).to_string()
}
