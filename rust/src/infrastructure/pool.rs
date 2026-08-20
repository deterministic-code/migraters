use sqlx::{MySqlPool, PgPool, SqlitePool};

use crate::abstractions::SqlDialect;

pub enum MigrationPool {
    Sqlite(SqlitePool),
    Postgres(PgPool),
    Mysql(MySqlPool),
}

impl MigrationPool {
    pub async fn connect(dialect: &dyn SqlDialect, connection: &str) -> Result<Self, sqlx::Error> {
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
        let stmts = crate::infrastructure::split_on_go(sql);
        if dialect.use_transaction() {
            self.apply_in_transaction(&stmts, catalog_sql, p1, p2).await
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

async fn catalog_exec_postgres(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), sqlx::Error> {
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

async fn catalog_exec_mysql(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), sqlx::Error> {
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
