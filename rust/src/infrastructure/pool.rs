use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::abstractions::Dialect;
use migraters_api::BoxError as ApiError;

type BoxError = Box<dyn std::error::Error>;

fn cast(err: ApiError) -> BoxError {
    err.to_string().into()
}

pub struct MigrationPool {
    dialect: &'static dyn Dialect,
    connection: String,
    setup_started: AtomicBool,
}

impl MigrationPool {
    pub async fn connect(dialect: &'static dyn Dialect, connection: &str) -> Result<Self, BoxError> {
        Ok(Self {
            dialect,
            connection: connection.to_string(),
            setup_started: AtomicBool::new(false),
        })
    }

    pub async fn setup(&self) -> Result<(), BoxError> {
        self.dialect.setup(&self.connection).await.map_err(cast)
    }

    pub async fn execute(&self, _sql: &str) -> Result<(), BoxError> {
        if self
            .setup_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            self.dialect.setup(&self.connection).await.map_err(cast)?;
        }
        Ok(())
    }

    pub async fn fetch_applied(
        &self,
        _sql: &str,
    ) -> Result<HashMap<String, Option<String>>, BoxError> {
        self.applied().await
    }

    pub async fn applied(&self) -> Result<HashMap<String, Option<String>>, BoxError> {
        self.dialect.applied(&self.connection).await.map_err(cast)
    }

    pub async fn apply_statements(
        &self,
        _dialect: &dyn Dialect,
        sql: &str,
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError> {
        if catalog_sql.to_ascii_uppercase().contains("DELETE") {
            self.dialect
                .migrate_down(&self.connection, p1, sql)
                .await
                .map_err(cast)
        } else {
            self.dialect
                .migrate_up(&self.connection, p1, sql, p2.unwrap_or(""))
                .await
                .map_err(cast)
        }
    }

    pub async fn migrate_up(&self, name: &str, body: &str, checksum: &str) -> Result<(), BoxError> {
        self.dialect
            .migrate_up(&self.connection, name, body, checksum)
            .await
            .map_err(cast)
    }

    pub async fn migrate_down(&self, name: &str, body: &str) -> Result<(), BoxError> {
        self.dialect
            .migrate_down(&self.connection, name, body)
            .await
            .map_err(cast)
    }

    pub async fn insert_log_started(
        &self,
        _dialect: &dyn Dialect,
        name: &str,
        direction: &str,
    ) -> Result<i64, BoxError> {
        self.log_started(name, direction).await
    }

    pub async fn log_started(&self, name: &str, direction: &str) -> Result<i64, BoxError> {
        self.dialect
            .log(&self.connection, None, name, direction, None, 0, None)
            .await
            .map_err(cast)
    }

    pub async fn update_log(
        &self,
        _dialect: &dyn Dialect,
        id: i64,
        status: &str,
        duration_ms: i64,
        error_message: Option<&str>,
    ) -> Result<(), BoxError> {
        self.log_finished(id, status, duration_ms, error_message)
            .await
    }

    pub async fn log_finished(
        &self,
        id: i64,
        status: &str,
        duration_ms: i64,
        error_message: Option<&str>,
    ) -> Result<(), BoxError> {
        self.dialect
            .log(
                &self.connection,
                Some(id),
                "",
                "",
                Some(status),
                duration_ms,
                error_message,
            )
            .await
            .map_err(cast)?;
        Ok(())
    }
}
