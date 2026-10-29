use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use crate::abstractions::IDatasourceProvider;
use crate::checksum::checksum_hex;
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
    provider: &'static dyn IDatasourceProvider,
    batch_separator: String,
}

impl Migrater {
    pub fn new(provider: &'static dyn IDatasourceProvider) -> Self {
        Self::with_batch_separator(provider, "GO")
    }

    pub fn with_batch_separator(
        provider: &'static dyn IDatasourceProvider,
        batch_separator: impl Into<String>,
    ) -> Self {
        Self {
            provider,
            batch_separator: batch_separator.into(),
        }
    }
}

impl IMigrater for Migrater {
    fn name(&self) -> &'static str {
        self.provider.name()
    }

    async fn setup(&self, args: SetupArg<'_>) -> Result<(), BoxError> {
        self.provider.prepare_setup(args.connection)?;
        self.provider
            .setup(args.connection)
            .await
            .map_err(|err| err.to_string())?;
        fs::create_dir_all(PathBuf::from(args.migrations_path))?;
        Ok(())
    }

    async fn up(&self, args: UpArg<'_>) -> Result<Vec<String>, BoxError> {
        let files = discover_up_files(args.migrations_path)?;
        let mut applied = self
            .provider
            .applied(args.connection)
            .await
            .map_err(|err| err.to_string())?;
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
            let log_id = self
                .provider
                .log(args.connection, None, &name, "up", None, 0, None)
                .await
                .map_err(|err| err.to_string())?;
            let started = Instant::now();
            match self
                .provider
                .migrate_up(args.connection, &name, &sql, &sum, &self.batch_separator)
                .await
            {
                Ok(()) => {
                    let _ = self
                        .provider
                        .log(
                            args.connection,
                            Some(log_id),
                            &name,
                            "up",
                            Some("success"),
                            started.elapsed().as_millis() as i64,
                            None,
                        )
                        .await;
                }
                Err(e) => {
                    let _ = self
                        .provider
                        .log(
                            args.connection,
                            Some(log_id),
                            &name,
                            "up",
                            Some("error"),
                            started.elapsed().as_millis() as i64,
                            Some(&e.to_string()),
                        )
                        .await;
                    return Err(e.to_string().into());
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
        let files = discover_up_files(args.migrations_path)?;
        let applied = self
            .provider
            .applied(args.connection)
            .await
            .map_err(|err| err.to_string())?;
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
        let log_id = self
            .provider
            .log(args.connection, None, &name, "down", None, 0, None)
            .await
            .map_err(|err| err.to_string())?;
        let started = Instant::now();
        match self
            .provider
            .migrate_down(args.connection, &name, &sql, &self.batch_separator)
            .await
        {
            Ok(()) => {
                let _ = self
                    .provider
                    .log(
                        args.connection,
                        Some(log_id),
                        &name,
                        "down",
                        Some("success"),
                        started.elapsed().as_millis() as i64,
                        None,
                    )
                    .await;
            }
            Err(e) => {
                let _ = self
                    .provider
                    .log(
                        args.connection,
                        Some(log_id),
                        &name,
                        "down",
                        Some("error"),
                        started.elapsed().as_millis() as i64,
                        Some(&e.to_string()),
                    )
                    .await;
                return Err(e.to_string().into());
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
        fs::write(
            dir.join(&down_name),
            scaffold("down", &[("name", args.name)]),
        )?;
        Ok(CreateResponse { up_name, down_name })
    }
}
