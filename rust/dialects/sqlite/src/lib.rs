use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use async_trait::async_trait;
use migraters_api::{catalog_name, BoxError, Dialect, DialectPlugin, MigrationDriver};
use migraters_sql::{SqlDriver, SqlSession};
use sqlx::sqlite::SqlitePool;
use sqlx::Row;

pub struct SqliteDialect;

pub static SQLITE: SqliteDialect = SqliteDialect;

inventory::submit! {
    DialectPlugin { dialect: &SQLITE }
}

const SQLITE_PREREQ: &str =
    include_str!("../../../../shared/templates/messages/errors/sqlite-prerequisite.txt");

impl Dialect for SqliteDialect {
    fn name(&self) -> &'static str {
        "sqlite"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["SQLITE_PATH", "DB_PATH"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../../../shared/templates/sql/sqlite/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../../../shared/templates/sql/sqlite/migrate_logs.sql")
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
        if connection.starts_with("sqlite:") {
            connection.to_string()
        } else {
            format!("sqlite://{}?mode=rwc", connection)
        }
    }
    fn prerequisite_error(&self, connection: &str) -> Option<String> {
        let path = filesystem_path(connection)?;
        if std::path::Path::new(&path).exists() {
            return None;
        }
        Some(SQLITE_PREREQ.replace("{{path}}", &path))
    }
    fn prepare_setup(&self, connection: &str) -> std::io::Result<()> {
        if let Some(path) = filesystem_path(connection) {
            if let Some(parent) = std::path::Path::new(&path).parent() {
                if !parent.as_os_str().is_empty() {
                    std::fs::create_dir_all(parent)?;
                }
            }
        }
        Ok(())
    }
    fn connect<'a>(
        &'a self,
        connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Box<dyn MigrationDriver>, BoxError>> + Send + 'a>> {
        Box::pin(async move {
            let url = self.normalize_connection(connection);
            let pool = SqlitePool::connect(&url).await?;
            Ok(Box::new(SqlDriver::wrap(SqliteSession { pool }, &SQLITE))
                as Box<dyn MigrationDriver>)
        })
    }
}

struct SqliteSession {
    pool: SqlitePool,
}

#[async_trait]
impl SqlSession for SqliteSession {
    async fn execute(&self, sql: &str) -> Result<(), BoxError> {
        sqlx::query(sql).execute(&self.pool).await?;
        Ok(())
    }

    async fn fetch_applied(&self, sql: &str) -> Result<HashMap<String, Option<String>>, BoxError> {
        let mut out = HashMap::new();
        for row in sqlx::query(sql).fetch_all(&self.pool).await? {
            let name: String = row.get(0);
            let checksum: Option<String> = row.try_get(1).ok().flatten();
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
        use sqlx::Executor;
        let mut tx = self.pool.begin().await?;
        for stmt in stmts {
            tx.execute(stmt.as_str()).await?;
        }
        catalog_exec_tx(&mut tx, catalog_sql, p1, p2).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn catalog_write(
        &self,
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError> {
        catalog_exec_pool(&self.pool, catalog_sql, p1, p2).await
    }

    async fn fetch_id(&self, sql: &str, p1: &str, p2: &str) -> Result<i64, BoxError> {
        Ok(sqlx::query(sql)
            .bind(p1)
            .bind(p2)
            .fetch_one(&self.pool)
            .await?
            .get::<i64, _>(0))
    }

    async fn update_log_exec(
        &self,
        sql: &str,
        status: &str,
        duration_ms: i64,
        error_message: Option<&str>,
        id: i64,
    ) -> Result<(), BoxError> {
        sqlx::query(sql)
            .bind(status)
            .bind(duration_ms)
            .bind(error_message)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

async fn catalog_exec_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), BoxError> {
    if let Some(p2) = p2 {
        sqlx::query(sql)
            .bind(p1)
            .bind(p2)
            .execute(&mut **tx)
            .await?;
    } else {
        sqlx::query(sql).bind(p1).execute(&mut **tx).await?;
    }
    Ok(())
}

async fn catalog_exec_pool(
    pool: &SqlitePool,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), BoxError> {
    if let Some(p2) = p2 {
        sqlx::query(sql).bind(p1).bind(p2).execute(pool).await?;
    } else {
        sqlx::query(sql).bind(p1).execute(pool).await?;
    }
    Ok(())
}

fn is_memory(connection: &str) -> bool {
    let s = connection.trim();
    if s.is_empty() || s == ":memory:" {
        return true;
    }
    let compact: String = s
        .chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(|c| c.to_lowercase())
        .collect();
    compact.contains(":memory:")
        || compact.contains("?mode=memory")
        || compact.contains("&mode=memory")
        || compact.contains(";mode=memory")
}

fn filesystem_path(connection: &str) -> Option<String> {
    if is_memory(connection) {
        return None;
    }
    let mut s = connection.trim().to_string();
    if let Some(eq) = s.find('=') {
        let key = s[..eq].trim().to_ascii_lowercase();
        if key.replace(' ', "") == "datasource" {
            s = s[eq + 1..].trim().to_string();
            if let Some(semi) = s.find(';') {
                s = s[..semi].trim().to_string();
            }
        }
    }
    let lower = s.to_ascii_lowercase();
    if lower.starts_with("sqlite://") {
        s = s["sqlite://".len()..].to_string();
    } else if lower.starts_with("sqlite:") {
        s = s["sqlite:".len()..].to_string();
    } else if lower.starts_with("file:") {
        s = s["file:".len()..].to_string();
    }
    if let Some(q) = s.find('?') {
        s = s[..q].to_string();
    }
    if s == ":memory:" || s.is_empty() {
        return None;
    }
    Some(s)
}

#[cfg(test)]
mod tests {
    use super::SqliteDialect;
    use migraters_api::{assert_dialect_surface, Dialect};

    #[test]
    fn surface_and_path_parsing() {
        let d = SqliteDialect;
        assert_dialect_surface(&d);
        assert_eq!(d.name(), "sqlite");
        assert_eq!(d.connection_env_vars(), &["SQLITE_PATH", "DB_PATH"]);
        assert!(d.use_transaction());
        assert_eq!(d.quote_ident("t"), "\"t\"");
        assert_eq!(d.now_expr(), "CURRENT_TIMESTAMP");
        assert_eq!(d.limit_clause(3), "LIMIT 3");
        assert!(d.insert_applied_sql().contains('?'));
        assert!(d.delete_applied_sql().contains('?'));

        assert_eq!(
            d.normalize_connection("sqlite://./app.sqlite"),
            "sqlite://./app.sqlite"
        );
        assert_eq!(
            d.normalize_connection("./app.sqlite"),
            "sqlite://./app.sqlite?mode=rwc"
        );

        assert!(d.prerequisite_error(":memory:").is_none());
        assert!(d.prerequisite_error("  :memory:  ").is_none());
        assert!(d.prerequisite_error("").is_none());
        assert!(d.prerequisite_error("sqlite://").is_none());
        assert!(d.prerequisite_error("file:").is_none());
        assert!(d.prerequisite_error("Data Source=:memory:").is_none());
        assert!(d.prerequisite_error("data source = :memory:").is_none());
        assert!(d
            .prerequisite_error("sqlite://file:migraters-test?mode=memory&cache=shared")
            .is_none());
        assert!(d
            .prerequisite_error("Data Source=migraters-test;Mode=Memory;Cache=Shared")
            .is_none());
        assert!(d.prerequisite_error("SQLITE://").is_none());
        assert!(d.prerequisite_error("FILE:").is_none());
        d.prepare_setup(":memory:").unwrap();
        d.prepare_setup("sqlite://file:migraters-test?mode=memory&cache=shared")
            .unwrap();
        d.prepare_setup("/").unwrap();
    }

    #[test]
    fn file_path_io() {
        let d = SqliteDialect;
        d.prepare_setup("app.sqlite").unwrap();

        let dir = std::env::temp_dir().join(format!(
            "migraters-sqlite-paths-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let existing = dir.join("exists.sqlite");
        std::fs::write(&existing, []).unwrap();
        assert!(d.prerequisite_error(existing.to_str().unwrap()).is_none());
        assert!(d
            .prerequisite_error(&format!("Data Source={}", existing.display()))
            .is_none());

        let missing = dir.join("nested").join("missing.sqlite");
        let err = d.prerequisite_error(missing.to_str().unwrap()).unwrap();
        assert!(err.contains(missing.to_str().unwrap()));
        d.prepare_setup(missing.to_str().unwrap()).unwrap();
        assert!(missing.parent().unwrap().is_dir());

        let blocker = dir.join("not-a-dir");
        std::fs::write(&blocker, []).unwrap();
        let blocked = blocker.join("db.sqlite");
        assert!(d.prepare_setup(blocked.to_str().unwrap()).is_err());

        assert!(d
            .prerequisite_error(&format!("sqlite://{}", missing.display()))
            .is_some());
        assert!(d
            .prerequisite_error(&format!("sqlite:{}", missing.display()))
            .is_some());
        assert!(d
            .prerequisite_error(&format!("file:{}", missing.display()))
            .is_some());
        assert!(d.prerequisite_error("other=value.sqlite").is_some());
        let _ = std::fs::remove_dir_all(dir);
    }
}
