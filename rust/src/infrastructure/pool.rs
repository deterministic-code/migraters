use std::collections::HashMap;
#[cfg(feature = "oracle")]
use std::sync::Mutex as StdMutex;

#[cfg(feature = "oracle")]
use oracle::Connection as OracleConn;
#[cfg(feature = "mysql")]
use sqlx::MySqlPool;
#[cfg(feature = "postgres")]
use sqlx::PgPool;
#[cfg(feature = "sqlite")]
use sqlx::SqlitePool;
#[cfg(feature = "sqlserver")]
use tiberius::{Client, Config};
#[cfg(feature = "sqlserver")]
use tokio::net::TcpStream;
#[cfg(feature = "sqlserver")]
use tokio::sync::Mutex;
#[cfg(feature = "sqlserver")]
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

use crate::abstractions::SqlDialect;
#[cfg(feature = "oracle")]
use crate::dialects::parse_oracle_connection;
use crate::migrations::catalog_name;

type BoxError = Box<dyn std::error::Error>;
#[cfg(feature = "sqlserver")]
type MssqlClient = Client<Compat<TcpStream>>;

pub enum MigrationPool {
    #[cfg(feature = "sqlite")]
    Sqlite(SqlitePool),
    #[cfg(feature = "postgres")]
    Postgres(PgPool),
    #[cfg(feature = "mysql")]
    Mysql(MySqlPool),
    #[cfg(feature = "sqlserver")]
    SqlServer(Mutex<MssqlClient>),
    #[cfg(feature = "oracle")]
    Oracle(StdMutex<OracleConn>),
}

impl MigrationPool {
    pub async fn connect(dialect: &dyn SqlDialect, connection: &str) -> Result<Self, BoxError> {
        let url = dialect.normalize_connection(connection);
        match dialect.name() {
            #[cfg(feature = "sqlite")]
            "sqlite" => Ok(Self::Sqlite(SqlitePool::connect(&url).await?)),
            #[cfg(feature = "postgres")]
            "postgres" => Ok(Self::Postgres(PgPool::connect(&url).await?)),
            #[cfg(feature = "mysql")]
            "mysql" => Ok(Self::Mysql(MySqlPool::connect(&url).await?)),
            #[cfg(feature = "sqlserver")]
            "sqlserver" => {
                let config = Config::from_ado_string(&url)
                    .or_else(|_| Config::from_jdbc_string(&url))
                    .map_err(|e| -> BoxError { e.into() })?;
                let tcp = TcpStream::connect(config.get_addr()).await?;
                tcp.set_nodelay(true)?;
                let client = Client::connect(config, tcp.compat_write()).await?;
                Ok(Self::SqlServer(Mutex::new(client)))
            }
            #[cfg(feature = "oracle")]
            "oracle" => {
                let (user, password, connect_string) = parse_oracle_connection(&url)?;
                let conn = tokio::task::spawn_blocking(move || {
                    OracleConn::connect(user, password, connect_string)
                })
                .await??;
                Ok(Self::Oracle(StdMutex::new(conn)))
            }
            other => Err(format!("unregistered dialect: {other}").into()),
        }
    }

    pub async fn execute(&self, sql: &str) -> Result<(), BoxError> {
        match self {
            #[cfg(feature = "sqlite")]
            Self::Sqlite(pool) => {
                sqlx::query(sql).execute(pool).await?;
            }
            #[cfg(feature = "postgres")]
            Self::Postgres(pool) => {
                sqlx::query(sql).execute(pool).await?;
            }
            #[cfg(feature = "mysql")]
            Self::Mysql(pool) => {
                sqlx::query(sql).execute(pool).await?;
            }
            #[cfg(feature = "sqlserver")]
            Self::SqlServer(client) => {
                let mut c = client.lock().await;
                c.execute(sql, &[]).await?;
            }
            #[cfg(feature = "oracle")]
            Self::Oracle(conn) => {
                let sql = sql.to_string();
                let conn = conn.lock().map_err(|e| e.to_string())?;
                conn.execute(&sql, &[])?;
            }
        }
        Ok(())
    }

    pub async fn fetch_applied(
        &self,
        sql: &str,
    ) -> Result<HashMap<String, Option<String>>, BoxError> {
        let mut out = HashMap::new();
        match self {
            #[cfg(feature = "sqlite")]
            Self::Sqlite(pool) => {
                use sqlx::Row;
                for row in sqlx::query(sql).fetch_all(pool).await? {
                    let name: String = row.get(0);
                    let checksum: Option<String> = row.try_get(1).ok().flatten();
                    out.insert(catalog_name(&name).to_string(), checksum);
                }
            }
            #[cfg(feature = "postgres")]
            Self::Postgres(pool) => {
                use sqlx::Row;
                for row in sqlx::query(sql).fetch_all(pool).await? {
                    let name: String = row.get(0);
                    let checksum: Option<String> = row.try_get(1).ok().flatten();
                    out.insert(catalog_name(&name).to_string(), checksum);
                }
            }
            #[cfg(feature = "mysql")]
            Self::Mysql(pool) => {
                use sqlx::Row;
                for row in sqlx::query(sql).fetch_all(pool).await? {
                    let name: String = row.get(0);
                    let checksum: Option<String> = row.try_get(1).ok().flatten();
                    out.insert(catalog_name(&name).to_string(), checksum);
                }
            }
            #[cfg(feature = "sqlserver")]
            Self::SqlServer(client) => {
                let mut c = client.lock().await;
                let stream = c.query(sql, &[]).await?;
                let rows = stream.into_first_result().await?;
                for row in rows {
                    let name: &str = row.get(0).ok_or("missing migrates.name")?;
                    let checksum: Option<&str> = row.get(1);
                    out.insert(catalog_name(name).to_string(), checksum.map(str::to_string));
                }
            }
            #[cfg(feature = "oracle")]
            Self::Oracle(conn) => {
                let sql = sql.to_string();
                let conn = conn.lock().map_err(|e| e.to_string())?;
                let rows = conn.query(&sql, &[])?;
                for row in rows {
                    let row = row?;
                    let name: String = row.get(0)?;
                    let checksum: Option<String> = row.get(1).ok();
                    out.insert(catalog_name(&name).to_string(), checksum);
                }
            }
        }
        Ok(out)
    }

    pub async fn apply_statements(
        &self,
        dialect: &dyn SqlDialect,
        sql: &str,
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError> {
        let stmts = crate::infrastructure::split_on_go(sql);
        if dialect.use_transaction() {
            self.apply_in_transaction(dialect, &stmts, catalog_sql, p1, p2)
                .await
        } else {
            for stmt in &stmts {
                self.execute(stmt).await?;
            }
            self.catalog_write(dialect, catalog_sql, p1, p2).await
        }
    }

    pub async fn insert_log_started(
        &self,
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
        self.catalog_write(dialect, &insert, name, Some(direction))
            .await?;
        let select = format!(
            "SELECT {id_col} AS id FROM {t} WHERE {migrate_name} = {} AND {dir_col} = {} ORDER BY {id_col} DESC {}",
            ph[0],
            ph[1],
            dialect.limit_clause(1)
        );
        self.fetch_id(dialect, &select, name, direction).await
    }

    pub async fn update_log(
        &self,
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
        self.update_log_exec(dialect, &sql, status, duration_ms, error_message, id)
            .await
    }

    async fn apply_in_transaction(
        &self,
        _dialect: &dyn SqlDialect,
        stmts: &[String],
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError> {
        match self {
            #[cfg(feature = "sqlite")]
            Self::Sqlite(pool) => {
                use sqlx::Executor;
                let mut tx = pool.begin().await?;
                for stmt in stmts {
                    tx.execute(stmt.as_str()).await?;
                }
                catalog_exec_sqlite(&mut tx, catalog_sql, p1, p2).await?;
                tx.commit().await?;
            }
            #[cfg(feature = "postgres")]
            Self::Postgres(pool) => {
                use sqlx::Executor;
                let mut tx = pool.begin().await?;
                for stmt in stmts {
                    tx.execute(stmt.as_str()).await?;
                }
                catalog_exec_postgres(&mut tx, catalog_sql, p1, p2).await?;
                tx.commit().await?;
            }
            #[cfg(feature = "mysql")]
            Self::Mysql(pool) => {
                use sqlx::Executor;
                let mut tx = pool.begin().await?;
                for stmt in stmts {
                    tx.execute(stmt.as_str()).await?;
                }
                catalog_exec_mysql(&mut tx, catalog_sql, p1, p2).await?;
                tx.commit().await?;
            }
            #[cfg(feature = "sqlserver")]
            Self::SqlServer(client) => {
                let mut c = client.lock().await;
                c.simple_query("BEGIN TRAN").await?;
                let result = async {
                    for stmt in stmts {
                        c.execute(stmt.as_str(), &[]).await?;
                    }
                    mssql_catalog(&mut c, catalog_sql, p1, p2).await
                }
                .await;
                match result {
                    Ok(()) => {
                        c.simple_query("COMMIT").await?;
                    }
                    Err(e) => {
                        let _ = c.simple_query("ROLLBACK").await;
                        return Err(e);
                    }
                }
            }
            #[cfg(feature = "oracle")]
            Self::Oracle(conn) => {
                let conn = conn.lock().map_err(|e| e.to_string())?;
                let result: Result<(), BoxError> = (|| {
                    for stmt in stmts {
                        conn.execute(stmt, &[])?;
                    }
                    oracle_catalog(&conn, catalog_sql, p1, p2)?;
                    conn.commit()?;
                    Ok(())
                })();
                if result.is_err() {
                    let _ = conn.rollback();
                }
                result?;
            }
        }
        Ok(())
    }

    async fn catalog_write(
        &self,
        _dialect: &dyn SqlDialect,
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError> {
        match self {
            #[cfg(feature = "sqlite")]
            Self::Sqlite(pool) => catalog_exec_pool_sqlite(pool, catalog_sql, p1, p2).await,
            #[cfg(feature = "postgres")]
            Self::Postgres(pool) => catalog_exec_pool_postgres(pool, catalog_sql, p1, p2).await,
            #[cfg(feature = "mysql")]
            Self::Mysql(pool) => catalog_exec_pool_mysql(pool, catalog_sql, p1, p2).await,
            #[cfg(feature = "sqlserver")]
            Self::SqlServer(client) => {
                let mut c = client.lock().await;
                mssql_catalog(&mut c, catalog_sql, p1, p2).await
            }
            #[cfg(feature = "oracle")]
            Self::Oracle(conn) => {
                let conn = conn.lock().map_err(|e| e.to_string())?;
                oracle_catalog(&conn, catalog_sql, p1, p2)
            }
        }
    }

    async fn fetch_id(
        &self,
        dialect: &dyn SqlDialect,
        sql: &str,
        p1: &str,
        p2: &str,
    ) -> Result<i64, BoxError> {
        let _ = dialect;
        Ok(match self {
            #[cfg(feature = "sqlite")]
            Self::Sqlite(pool) => {
                use sqlx::Row;
                sqlx::query(sql)
                    .bind(p1)
                    .bind(p2)
                    .fetch_one(pool)
                    .await?
                    .get::<i64, _>(0)
            }
            #[cfg(feature = "postgres")]
            Self::Postgres(pool) => {
                use sqlx::Row;
                sqlx::query(sql)
                    .bind(p1)
                    .bind(p2)
                    .fetch_one(pool)
                    .await?
                    .get::<i64, _>(0)
            }
            #[cfg(feature = "mysql")]
            Self::Mysql(pool) => {
                use sqlx::Row;
                let row = sqlx::query(sql).bind(p1).bind(p2).fetch_one(pool).await?;
                row.try_get::<i64, _>(0)
                    .or_else(|_| row.try_get::<u64, _>(0).map(|v| v as i64))?
            }
            #[cfg(feature = "sqlserver")]
            Self::SqlServer(client) => {
                let mut c = client.lock().await;
                let stream = c.query(sql, &[&p1 as &dyn tiberius::ToSql, &p2]).await?;
                let row = stream.into_row().await?.ok_or("missing migrate_logs id")?;
                row.get::<i64, usize>(0).ok_or("missing migrate_logs id")?
            }
            #[cfg(feature = "oracle")]
            Self::Oracle(conn) => {
                let sql = sql.to_string();
                let p1 = p1.to_string();
                let p2 = p2.to_string();
                let conn = conn.lock().map_err(|e| e.to_string())?;
                let row = conn.query_row(&sql, &[&p1, &p2])?;
                row.get::<usize, i64>(0)?
            }
        })
    }

    async fn update_log_exec(
        &self,
        dialect: &dyn SqlDialect,
        sql: &str,
        status: &str,
        duration_ms: i64,
        error_message: Option<&str>,
        id: i64,
    ) -> Result<(), BoxError> {
        let _ = dialect;
        match self {
            #[cfg(feature = "sqlite")]
            Self::Sqlite(pool) => {
                sqlx::query(sql)
                    .bind(status)
                    .bind(duration_ms)
                    .bind(error_message)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
            #[cfg(feature = "postgres")]
            Self::Postgres(pool) => {
                sqlx::query(sql)
                    .bind(status)
                    .bind(duration_ms)
                    .bind(error_message)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
            #[cfg(feature = "mysql")]
            Self::Mysql(pool) => {
                sqlx::query(sql)
                    .bind(status)
                    .bind(duration_ms)
                    .bind(error_message)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
            #[cfg(feature = "sqlserver")]
            Self::SqlServer(client) => {
                let mut c = client.lock().await;
                let err = error_message.unwrap_or("");
                c.execute(sql, &[&status, &duration_ms, &err, &id]).await?;
            }
            #[cfg(feature = "oracle")]
            Self::Oracle(conn) => {
                let sql = sql.to_string();
                let status = status.to_string();
                let err = error_message.map(str::to_string);
                let conn = conn.lock().map_err(|e| e.to_string())?;
                conn.execute(&sql, &[&status, &duration_ms, &err, &id])?;
            }
        }
        Ok(())
    }
}

fn placeholders(dialect: &str, n: usize) -> Vec<String> {
    match dialect {
        "postgres" => (1..=n).map(|i| format!("${i}")).collect(),
        "sqlserver" => (1..=n).map(|i| format!("@P{i}")).collect(),
        "oracle" => (1..=n).map(|i| format!(":{i}")).collect(),
        _ => (0..n).map(|_| "?".into()).collect(),
    }
}

#[cfg(feature = "sqlite")]
async fn catalog_exec_sqlite(
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

#[cfg(feature = "postgres")]
async fn catalog_exec_postgres(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
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

#[cfg(feature = "mysql")]
async fn catalog_exec_mysql(
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

#[cfg(feature = "sqlite")]
async fn catalog_exec_pool_sqlite(
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

#[cfg(feature = "postgres")]
async fn catalog_exec_pool_postgres(
    pool: &PgPool,
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

#[cfg(feature = "mysql")]
async fn catalog_exec_pool_mysql(
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

#[cfg(feature = "sqlserver")]
async fn mssql_catalog(
    client: &mut MssqlClient,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), BoxError> {
    if let Some(p2) = p2 {
        client.execute(sql, &[&p1, &p2]).await?;
    } else {
        client.execute(sql, &[&p1]).await?;
    }
    Ok(())
}

#[cfg(feature = "oracle")]
fn oracle_catalog(
    conn: &OracleConn,
    sql: &str,
    p1: &str,
    p2: Option<&str>,
) -> Result<(), BoxError> {
    if let Some(p2) = p2 {
        conn.execute(sql, &[&p1, &p2])?;
    } else {
        conn.execute(sql, &[&p1])?;
    }
    Ok(())
}
