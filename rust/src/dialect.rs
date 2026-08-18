use sqlx::{MySqlPool, PgPool, SqlitePool};

pub trait SqlDialect: Send + Sync {
    fn name(&self) -> &'static str;
    fn connection_env_vars(&self) -> &'static [&'static str];
    fn migrates_ddl(&self) -> &'static str;
    fn migrate_logs_ddl(&self) -> &'static str;
    fn use_transaction(&self) -> bool;
    fn select_applied_sql(&self) -> &'static str;
    fn select_last_applied_sql(&self) -> &'static str;
    fn insert_applied_sql(&self) -> &'static str;
    fn delete_applied_sql(&self) -> &'static str;
    fn normalize_connection(&self, connection: &str) -> String;
    fn prerequisite_error(&self, connection: &str) -> Option<String>;
    fn prepare_setup(&self, connection: &str) -> std::io::Result<()>;
}

pub struct SqliteDialect;
pub struct PostgresDialect;
pub struct MysqlDialect;

impl SqlDialect for SqliteDialect {
    fn name(&self) -> &'static str {
        "sqlite"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["SQLITE_PATH", "DB_PATH"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../templates/sql/sqlite/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../templates/sql/sqlite/migrate_logs.sql")
    }
    fn use_transaction(&self) -> bool {
        true
    }
    fn select_applied_sql(&self) -> &'static str {
        r#"SELECT "name" FROM "migrates""#
    }
    fn select_last_applied_sql(&self) -> &'static str {
        r#"SELECT "name" FROM "migrates" ORDER BY "name" DESC LIMIT 1"#
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
        let path = sqlite_filesystem_path(connection)?;
        if std::path::Path::new(&path).exists() {
            return None;
        }
        Some(format!(
            "sqlite file: {} does not exist — run 'migrate-setup --provider sqlite --connection {}' to create it",
            path, path
        ))
    }
    fn prepare_setup(&self, connection: &str) -> std::io::Result<()> {
        if let Some(path) = sqlite_filesystem_path(connection) {
            if let Some(parent) = std::path::Path::new(&path).parent() {
                if !parent.as_os_str().is_empty() {
                    std::fs::create_dir_all(parent)?;
                }
            }
        }
        Ok(())
    }
}

impl SqlDialect for PostgresDialect {
    fn name(&self) -> &'static str {
        "postgres"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["PG_CONNECTION_STRING", "DATABASE_URL"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../templates/sql/postgres/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../templates/sql/postgres/migrate_logs.sql")
    }
    fn use_transaction(&self) -> bool {
        true
    }
    fn select_applied_sql(&self) -> &'static str {
        r#"SELECT "name" FROM "migrates""#
    }
    fn select_last_applied_sql(&self) -> &'static str {
        r#"SELECT "name" FROM "migrates" ORDER BY "name" DESC LIMIT 1"#
    }
    fn insert_applied_sql(&self) -> &'static str {
        r#"INSERT INTO "migrates" ("name", "checksum") VALUES ($1, $2)"#
    }
    fn delete_applied_sql(&self) -> &'static str {
        r#"DELETE FROM "migrates" WHERE "name" = $1"#
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
}

impl SqlDialect for MysqlDialect {
    fn name(&self) -> &'static str {
        "mysql"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["MYSQL_URL", "DATABASE_URL"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../templates/sql/mysql/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../templates/sql/mysql/migrate_logs.sql")
    }
    fn use_transaction(&self) -> bool {
        false
    }
    fn select_applied_sql(&self) -> &'static str {
        "SELECT `name` FROM `migrates`"
    }
    fn select_last_applied_sql(&self) -> &'static str {
        "SELECT `name` FROM `migrates` ORDER BY `name` DESC LIMIT 1"
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
}

pub fn try_get(name: &str) -> Option<&'static dyn SqlDialect> {
    match name {
        "sqlite" => Some(&SqliteDialect),
        "postgres" => Some(&PostgresDialect),
        "mysql" => Some(&MysqlDialect),
        _ => None,
    }
}

pub fn connection_from_env(dialect: &dyn SqlDialect) -> Option<String> {
    dialect
        .connection_env_vars()
        .iter()
        .find_map(|name| std::env::var(name).ok().filter(|v| !v.is_empty()))
}

fn sqlite_filesystem_path(connection: &str) -> Option<String> {
    let mut s = connection.trim().to_string();
    if let Some(eq) = s.find('=') {
        let key = s[..eq].trim().to_ascii_lowercase();
        if key.replace(' ', "") == "datasource" {
            s = s[eq + 1..].trim().to_string();
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
    if s == ":memory:" || s.is_empty() {
        return None;
    }
    Some(s)
}

pub enum MigrationPool {
    Sqlite(SqlitePool),
    Postgres(PgPool),
    Mysql(MySqlPool),
}

impl MigrationPool {
    pub async fn connect(
        dialect: &dyn SqlDialect,
        connection: &str,
    ) -> Result<Self, sqlx::Error> {
        let url = dialect.normalize_connection(connection);
        match dialect.name() {
            "sqlite" => Ok(Self::Sqlite(SqlitePool::connect(&url).await?)),
            "postgres" => Ok(Self::Postgres(PgPool::connect(&url).await?)),
            "mysql" => Ok(Self::Mysql(MySqlPool::connect(&url).await?)),
            other => panic!("unregistered dialect: {other}"),
        }
    }

    pub async fn execute(&self, sql: &str) -> Result<(), sqlx::Error> {
        match self {
            Self::Sqlite(pool) => {
                sqlx::query(sql).execute(pool).await?;
            }
            Self::Postgres(pool) => {
                sqlx::query(sql).execute(pool).await?;
            }
            Self::Mysql(pool) => {
                sqlx::query(sql).execute(pool).await?;
            }
        }
        Ok(())
    }

    pub async fn fetch_strings(&self, sql: &str) -> Result<Vec<String>, sqlx::Error> {
        use sqlx::Row;
        Ok(match self {
            Self::Sqlite(pool) => sqlx::query(sql)
                .fetch_all(pool)
                .await?
                .into_iter()
                .map(|r| r.get::<String, _>(0))
                .collect(),
            Self::Postgres(pool) => sqlx::query(sql)
                .fetch_all(pool)
                .await?
                .into_iter()
                .map(|r| r.get::<String, _>(0))
                .collect(),
            Self::Mysql(pool) => sqlx::query(sql)
                .fetch_all(pool)
                .await?
                .into_iter()
                .map(|r| r.get::<String, _>(0))
                .collect(),
        })
    }

    pub async fn fetch_optional_string(&self, sql: &str) -> Result<Option<String>, sqlx::Error> {
        use sqlx::Row;
        Ok(match self {
            Self::Sqlite(pool) => sqlx::query(sql)
                .fetch_optional(pool)
                .await?
                .map(|r| r.get::<String, _>(0)),
            Self::Postgres(pool) => sqlx::query(sql)
                .fetch_optional(pool)
                .await?
                .map(|r| r.get::<String, _>(0)),
            Self::Mysql(pool) => sqlx::query(sql)
                .fetch_optional(pool)
                .await?
                .map(|r| r.get::<String, _>(0)),
        })
    }

    pub async fn apply_statements(
        &self,
        dialect: &dyn SqlDialect,
        sql: &str,
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        let stmts = crate::split_statements::split_statements(sql);
        if dialect.use_transaction() {
            self.apply_in_transaction(&stmts, catalog_sql, p1, p2)
                .await
        } else {
            for stmt in &stmts {
                self.execute(stmt).await?;
            }
            self.catalog_write(catalog_sql, p1, p2).await
        }
    }

    async fn apply_in_transaction(
        &self,
        stmts: &[String],
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        use sqlx::Executor;
        match self {
            Self::Sqlite(pool) => {
                let mut tx = pool.begin().await?;
                for stmt in stmts {
                    tx.execute(stmt.as_str()).await?;
                }
                catalog_exec_sqlite(&mut tx, catalog_sql, p1, p2).await?;
                tx.commit().await?;
            }
            Self::Postgres(pool) => {
                let mut tx = pool.begin().await?;
                for stmt in stmts {
                    tx.execute(stmt.as_str()).await?;
                }
                catalog_exec_postgres(&mut tx, catalog_sql, p1, p2).await?;
                tx.commit().await?;
            }
            Self::Mysql(pool) => {
                let mut tx = pool.begin().await?;
                for stmt in stmts {
                    tx.execute(stmt.as_str()).await?;
                }
                catalog_exec_mysql(&mut tx, catalog_sql, p1, p2).await?;
                tx.commit().await?;
            }
        }
        Ok(())
    }

    async fn catalog_write(
        &self,
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        match self {
            Self::Sqlite(pool) => catalog_exec_pool_sqlite(pool, catalog_sql, p1, p2).await,
            Self::Postgres(pool) => catalog_exec_pool_postgres(pool, catalog_sql, p1, p2).await,
            Self::Mysql(pool) => catalog_exec_pool_mysql(pool, catalog_sql, p1, p2).await,
        }
    }
}

async fn catalog_exec_sqlite(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), sqlx::Error> {
    if let Some(p2) = p2 {
        sqlx::query(sql).bind(p1).bind(p2).execute(&mut **tx).await?;
    } else {
        sqlx::query(sql).bind(p1).execute(&mut **tx).await?;
    }
    Ok(())
}

async fn catalog_exec_postgres(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), sqlx::Error> {
    if let Some(p2) = p2 {
        sqlx::query(sql).bind(p1).bind(p2).execute(&mut **tx).await?;
    } else {
        sqlx::query(sql).bind(p1).execute(&mut **tx).await?;
    }
    Ok(())
}

async fn catalog_exec_mysql(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), sqlx::Error> {
    if let Some(p2) = p2 {
        sqlx::query(sql).bind(p1).bind(p2).execute(&mut **tx).await?;
    } else {
        sqlx::query(sql).bind(p1).execute(&mut **tx).await?;
    }
    Ok(())
}

async fn catalog_exec_pool_sqlite(
    pool: &SqlitePool,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), sqlx::Error> {
    if let Some(p2) = p2 {
        sqlx::query(sql).bind(p1).bind(p2).execute(pool).await?;
    } else {
        sqlx::query(sql).bind(p1).execute(pool).await?;
    }
    Ok(())
}

async fn catalog_exec_pool_postgres(
    pool: &PgPool,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), sqlx::Error> {
    if let Some(p2) = p2 {
        sqlx::query(sql).bind(p1).bind(p2).execute(pool).await?;
    } else {
        sqlx::query(sql).bind(p1).execute(pool).await?;
    }
    Ok(())
}

async fn catalog_exec_pool_mysql(
    pool: &MySqlPool,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), sqlx::Error> {
    if let Some(p2) = p2 {
        sqlx::query(sql).bind(p1).bind(p2).execute(pool).await?;
    } else {
        sqlx::query(sql).bind(p1).execute(pool).await?;
    }
    Ok(())
}
