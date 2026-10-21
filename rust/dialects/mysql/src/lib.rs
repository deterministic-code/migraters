use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use async_trait::async_trait;
use migraters_api::{catalog_name, BoxError, Dialect, DialectPlugin, MigrationDriver};
use migraters_sql::{SqlDriver, SqlSession};
use sqlx::mysql::MySqlPool;
use sqlx::Row;

pub struct MysqlDialect;

pub static MYSQL: MysqlDialect = MysqlDialect;

inventory::submit! {
    DialectPlugin { dialect: &MYSQL }
}

impl Dialect for MysqlDialect {
    fn name(&self) -> &'static str {
        "mysql"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["MYSQL_URL", "DATABASE_URL"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../../../shared/templates/sql/mysql/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../../../shared/templates/sql/mysql/migrate_logs.sql")
    }
    fn use_transaction(&self) -> bool {
        false
    }
    fn insert_applied_sql(&self) -> &'static str {
        "INSERT INTO `migrates` (`name`, `checksum`) VALUES (?, ?)"
    }
    fn delete_applied_sql(&self) -> &'static str {
        "DELETE FROM `migrates` WHERE `name` = ?"
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
        format!("`{ident}`")
    }
    fn connect<'a>(
        &'a self,
        connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Box<dyn MigrationDriver>, BoxError>> + Send + 'a>> {
        Box::pin(async move {
            let url = self.normalize_connection(connection);
            let pool = MySqlPool::connect(&url).await?;
            Ok(Box::new(SqlDriver::wrap(MysqlSession { pool }, &MYSQL)) as Box<dyn MigrationDriver>)
        })
    }
    fn create_database<'a>(
        &'a self,
        connection: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<(), BoxError>> + Send + 'a>> {
        Box::pin(async move { create_database(connection).await })
    }
}

struct MysqlSession {
    pool: MySqlPool,
}

#[async_trait]
impl SqlSession for MysqlSession {
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
        let row = sqlx::query(sql)
            .bind(p1)
            .bind(p2)
            .fetch_one(&self.pool)
            .await?;
        Ok(row
            .try_get::<i64, _>(0)
            .or_else(|_| row.try_get::<u64, _>(0).map(|v| v as i64))?)
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
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
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
    pool: &MySqlPool,
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

fn database_name_from_url(connection: &str) -> Option<&str> {
    let (_, tail) = connection.rsplit_once('/')?;
    let name = tail.split(['?', '#']).next()?;
    if name.is_empty() {
        return None;
    }
    Some(name)
}

fn admin_url(connection: &str, admin_db: &str) -> Option<String> {
    let (head, tail) = connection.rsplit_once('/')?;
    let rest = tail.find(['?', '#']).map(|i| &tail[i..]).unwrap_or("");
    Some(format!("{head}/{admin_db}{rest}"))
}

async fn create_database(connection: &str) -> Result<(), BoxError> {
    let Some(name) = database_name_from_url(connection) else {
        return Ok(());
    };
    let Some(admin) = admin_url(connection, "") else {
        return Ok(());
    };
    let pool = MySqlPool::connect(&admin).await?;
    let sql = format!("CREATE DATABASE IF NOT EXISTS `{name}`");
    sqlx::query(&sql).execute(&pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::MysqlDialect;
    use migraters_api::{assert_dialect_surface, Dialect};

    #[test]
    fn surface() {
        let d = MysqlDialect;
        assert_dialect_surface(&d);
        assert_eq!(d.name(), "mysql");
        assert_eq!(d.connection_env_vars(), &["MYSQL_URL", "DATABASE_URL"]);
        assert!(!d.use_transaction());
        assert_eq!(
            d.normalize_connection("mysql://localhost/db"),
            "mysql://localhost/db"
        );
        assert!(d.prerequisite_error("mysql://localhost/db").is_none());
        d.prepare_setup("mysql://localhost/db").unwrap();
        assert!(d.insert_applied_sql().contains('?'));
        assert!(d.delete_applied_sql().contains('?'));
        assert_eq!(d.quote_ident("t"), "`t`");
        assert_eq!(d.now_expr(), "CURRENT_TIMESTAMP");
        assert_eq!(d.limit_clause(2), "LIMIT 2");
    }
}
