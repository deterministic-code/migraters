use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use crate::abstractions::{try_get, SqlDialect};
use crate::checksum::checksum_hex;
use crate::infrastructure::MigrationPool;
use crate::messages::{message, scaffold};
use crate::migrations::{
    assert_no_checksum_drift, discover_up_files, down_path_for, is_migration_name, next_sequence,
};

type BoxError = Box<dyn std::error::Error>;

pub struct SetupArg<'a> {
    pub connection: &'a str,
    pub migrations_path: &'a str,
}

pub struct UpArg<'a> {
    pub connection: &'a str,
    pub migrations_path: &'a str,
    pub one: bool,
}

pub struct DownArg<'a> {
    pub connection: &'a str,
    pub migrations_path: &'a str,
}

pub struct CreateArg<'a> {
    pub name: &'a str,
    pub migrations_path: &'a str,
}

pub struct CreateResponse {
    pub up_name: String,
    pub down_name: String,
}

#[allow(async_fn_in_trait)]
pub trait IMigrater: Send + Sync {
    fn name(&self) -> &'static str;
    async fn setup(&self, args: SetupArg<'_>) -> Result<(), BoxError>;
    async fn up(&self, args: UpArg<'_>) -> Result<Vec<String>, BoxError>;
    async fn down(&self, args: DownArg<'_>) -> Result<Option<String>, BoxError>;
    fn create(&self, args: CreateArg<'_>) -> Result<CreateResponse, BoxError>;
}

pub struct Migrater {
    dialect: &'static dyn SqlDialect,
}

impl Migrater {
    pub fn new(dialect: &'static dyn SqlDialect) -> Self {
        Self { dialect }
    }
}

pub fn get_migrater(name: &str) -> Option<Migrater> {
    try_get(name).map(Migrater::new)
}

impl IMigrater for Migrater {
    fn name(&self) -> &'static str {
        self.dialect.name()
    }

    async fn setup(&self, args: SetupArg<'_>) -> Result<(), BoxError> {
        self.dialect.prepare_setup(args.connection)?;
        let pool = MigrationPool::connect(self.dialect, args.connection).await?;
        pool.execute(self.dialect.migrates_ddl()).await?;
        pool.execute(self.dialect.migrate_logs_ddl()).await?;
        fs::create_dir_all(PathBuf::from(args.migrations_path))?;
        Ok(())
    }

    async fn up(&self, args: UpArg<'_>) -> Result<Vec<String>, BoxError> {
        let pool = MigrationPool::connect(self.dialect, args.connection).await?;
        let files = discover_up_files(args.migrations_path)?;
        let mut applied = pool
            .fetch_applied(&self.dialect.select_applied_checksum_sql())
            .await?;
        assert_no_checksum_drift(&files, &applied)?;
        let mut names = Vec::new();
        loop {
            let next = files
                .iter()
                .find(|(n, _)| !applied.contains_key(n))
                .cloned();
            let Some((name, path)) = next else {
                return Ok(names);
            };
            let sql = fs::read_to_string(&path)?;
            let sum = checksum_hex(&sql);
            let log_id = pool.insert_log_started(self.dialect, &name, "up").await?;
            let started = Instant::now();
            match pool
                .apply_statements(
                    self.dialect,
                    &sql,
                    self.dialect.insert_applied_sql(),
                    &name,
                    Some(&sum),
                )
                .await
            {
                Ok(()) => {
                    let _ = pool
                        .update_log(
                            self.dialect,
                            log_id,
                            "success",
                            started.elapsed().as_millis() as i64,
                            None,
                        )
                        .await;
                }
                Err(e) => {
                    let _ = pool
                        .update_log(
                            self.dialect,
                            log_id,
                            "error",
                            started.elapsed().as_millis() as i64,
                            Some(&e.to_string()),
                        )
                        .await;
                    return Err(e);
                }
            }
            applied.insert(name.clone(), Some(sum));
            names.push(name);
            if args.one {
                return Ok(names);
            }
        }
    }

    async fn down(&self, args: DownArg<'_>) -> Result<Option<String>, BoxError> {
        let pool = MigrationPool::connect(self.dialect, args.connection).await?;
        let files = discover_up_files(args.migrations_path)?;
        let applied = pool
            .fetch_applied(&self.dialect.select_applied_checksum_sql())
            .await?;
        if applied.is_empty() {
            return Ok(None);
        }
        assert_no_checksum_drift(&files, &applied)?;
        let last = files
            .iter()
            .rev()
            .find(|(n, _)| applied.contains_key(n))
            .cloned();
        let Some((name, _)) = last else {
            return Err(message("errors/rollback-not-in-path", &[]).into());
        };
        let path = down_path_for(args.migrations_path, &name)
            .ok_or_else(|| message("errors/rollback-no-down-sibling", &[("name", &name)]))?;
        let sql = fs::read_to_string(&path)?;
        let log_id = pool
            .insert_log_started(self.dialect, &name, "down")
            .await?;
        let started = Instant::now();
        match pool
            .apply_statements(
                self.dialect,
                &sql,
                self.dialect.delete_applied_sql(),
                &name,
                None,
            )
            .await
        {
            Ok(()) => {
                let _ = pool
                    .update_log(
                        self.dialect,
                        log_id,
                        "success",
                        started.elapsed().as_millis() as i64,
                        None,
                    )
                    .await;
            }
            Err(e) => {
                let _ = pool
                    .update_log(
                        self.dialect,
                        log_id,
                        "error",
                        started.elapsed().as_millis() as i64,
                        Some(&e.to_string()),
                    )
                    .await;
                return Err(e);
            }
        }
        Ok(Some(name))
    }

    fn create(&self, args: CreateArg<'_>) -> Result<CreateResponse, BoxError> {
        if !is_migration_name(args.name) {
            return Err(message("errors/invalid-name", &[("name", args.name)]).into());
        }
        let dir = PathBuf::from(args.migrations_path);
        fs::create_dir_all(&dir)?;
        let seq = if dir.is_dir() {
            let mut names = Vec::new();
            for entry in fs::read_dir(&dir)? {
                let entry = entry?;
                if let Ok(file_name) = entry.file_name().into_string() {
                    names.push(file_name);
                }
            }
            next_sequence(names)
        } else {
            1
        };
        let prefix = format!("{seq:04}");
        let up_name = format!("{prefix}_{}_up.sql", args.name);
        let down_name = format!("{prefix}_{}_down.sql", args.name);
        fs::write(dir.join(&up_name), scaffold("up", &[("name", args.name)]))?;
        fs::write(dir.join(&down_name), scaffold("down", &[("name", args.name)]))?;
        Ok(CreateResponse {
            up_name,
            down_name,
        })
    }
}
