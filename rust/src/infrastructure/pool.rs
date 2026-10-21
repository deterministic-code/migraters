use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::abstractions::Dialect;
use migraters_api::{BoxError as ApiError, MigrationDriver};

type BoxError = Box<dyn std::error::Error>;

fn cast(err: ApiError) -> BoxError {
    err.to_string().into()
}

pub struct MigrationPool {
    driver: Box<dyn MigrationDriver>,
    setup_started: AtomicBool,
}

impl MigrationPool {
    pub async fn connect(dialect: &dyn Dialect, connection: &str) -> Result<Self, BoxError> {
        Ok(Self {
            driver: dialect.connect(connection).await.map_err(cast)?,
            setup_started: AtomicBool::new(false),
        })
    }

    pub async fn setup(&self) -> Result<(), BoxError> {
        self.driver.setup().await.map_err(cast)
    }

    pub async fn execute(&self, _sql: &str) -> Result<(), BoxError> {
        if self
            .setup_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            self.driver.setup().await.map_err(cast)?;
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
        self.driver.applied().await.map_err(cast)
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
            self.driver.migrate_down(p1, sql).await.map_err(cast)
        } else {
            self.driver
                .migrate_up(p1, sql, p2.unwrap_or(""))
                .await
                .map_err(cast)
        }
    }

    pub async fn migrate_up(&self, name: &str, body: &str, checksum: &str) -> Result<(), BoxError> {
        self.driver
            .migrate_up(name, body, checksum)
            .await
            .map_err(cast)
    }

    pub async fn migrate_down(&self, name: &str, body: &str) -> Result<(), BoxError> {
        self.driver.migrate_down(name, body).await.map_err(cast)
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
        self.driver.log_started(name, direction).await.map_err(cast)
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
        self.driver
            .log_finished(id, status, duration_ms, error_message)
            .await
            .map_err(cast)
    }
}
