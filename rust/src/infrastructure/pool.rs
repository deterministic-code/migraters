use std::collections::HashMap;

use crate::abstractions::SqlDialect;
use migraters_api::{
    apply_statements, insert_log_started, update_log, BoxError as ApiError, MigrationSession,
};

type BoxError = Box<dyn std::error::Error>;

fn cast(err: ApiError) -> BoxError {
    err.to_string().into()
}

pub struct MigrationPool {
    session: Box<dyn MigrationSession>,
}

impl MigrationPool {
    pub async fn connect(dialect: &dyn SqlDialect, connection: &str) -> Result<Self, BoxError> {
        Ok(Self {
            session: dialect.connect(connection).await.map_err(cast)?,
        })
    }

    pub async fn execute(&self, sql: &str) -> Result<(), BoxError> {
        self.session.execute(sql).await.map_err(cast)
    }

    pub async fn fetch_applied(
        &self,
        sql: &str,
    ) -> Result<HashMap<String, Option<String>>, BoxError> {
        self.session.fetch_applied(sql).await.map_err(cast)
    }

    pub async fn apply_statements(
        &self,
        dialect: &dyn SqlDialect,
        sql: &str,
        catalog_sql: &str,
        p1: &str,
        p2: Option<&str>,
    ) -> Result<(), BoxError> {
        apply_statements(&*self.session, dialect, sql, catalog_sql, p1, p2)
            .await
            .map_err(cast)
    }

    pub async fn insert_log_started(
        &self,
        dialect: &dyn SqlDialect,
        name: &str,
        direction: &str,
    ) -> Result<i64, BoxError> {
        insert_log_started(&*self.session, dialect, name, direction)
            .await
            .map_err(cast)
    }

    pub async fn update_log(
        &self,
        dialect: &dyn SqlDialect,
        id: i64,
        status: &str,
        duration_ms: i64,
        error_message: Option<&str>,
    ) -> Result<(), BoxError> {
        update_log(
            &*self.session,
            dialect,
            id,
            status,
            duration_ms,
            error_message,
        )
        .await
        .map_err(cast)
    }
}
