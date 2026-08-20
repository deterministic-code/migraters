// Idempotent CREATE TABLE IF NOT EXISTS migrates+migrate_logs; mirrors scripts/lib/datasource-migrate.mjs:setupSql so rust + TS containers share one migrates contract.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process;

use deterministic_migraters::{
    connection_from_env, fill_help_template, message, try_get, MigrationPool, SqlDialect,
    SUPPORTED_PROVIDERS,
};

const HELP_TEMPLATE: &str = include_str!("../../../shared/templates/help/setup.txt");

fn help_text() -> String {
    fill_help_template(HELP_TEMPLATE, "migrate-setup")
}

struct Args {
    dialect: &'static dyn SqlDialect,
    connection: String,
    migrations_path: String,
    and_up: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut provider: Option<String> = None;
    let mut connection: Option<String> = None;
    let mut migrations_path: Option<String> = None;
    let mut and_up = false;
    let mut iter = env::args().skip(1);
    while let Some(a) = iter.next() {
        match a.as_str() {
            "--provider" => provider = iter.next(),
            "--connection" => connection = iter.next(),
            "--migrations-path" => migrations_path = iter.next(),
            "--migrate-path" => migrations_path = iter.next(),
            "--and-up" => and_up = true,
            "-h" | "--help" => {
                eprint!("{}", help_text());
                process::exit(0);
            }
            other => return Err(message("errors/unknown-arg", &[("arg", other)])),
        }
    }
    let Some(provider) = provider else {
        return Err(message(
            "errors/missing-provider-hint",
            &[("providers", SUPPORTED_PROVIDERS)],
        ));
    };
    let Some(dialect) = try_get(&provider) else {
        return Err(message(
            "errors/unsupported-provider",
            &[("provider", &provider)],
        ));
    };
    let connection = match connection.or_else(|| connection_from_env(dialect)) {
        Some(c) => c,
        None => {
            return Err(message(
                "errors/missing-connection",
                &[("envVars", &dialect.connection_env_vars().join(", "))],
            ))
        }
    };
    let migrations_path =
        migrations_path.unwrap_or_else(|| format!("./sql/{}/migrations", dialect.name()));
    Ok(Args {
        dialect,
        connection,
        migrations_path,
        and_up,
    })
}

fn sibling_migrate_up_binary() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let me = env::current_exe()?;
    let dir = me.parent().ok_or("current_exe has no parent")?;
    let mut name = String::from("migrate-up");
    if let Some(ext) = me.extension().and_then(|e| e.to_str()) {
        name.push('.');
        name.push_str(ext);
    }
    Ok(dir.join(name))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    match dotenvy::from_path(".env") {
        Ok(()) => {}
        Err(dotenvy::Error::Io(err)) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(format!("failed to load .env: {err}").into()),
    }
    let args = match parse_args() {
        Ok(a) => a,
        Err(msg) => {
            eprintln!("{}", msg);
            process::exit(2);
        }
    };
    args.dialect.prepare_setup(&args.connection)?;
    let pool = MigrationPool::connect(args.dialect, &args.connection).await?;
    pool.execute(args.dialect.migrates_ddl()).await?;
    pool.execute(args.dialect.migrate_logs_ddl()).await?;
    fs::create_dir_all(PathBuf::from(&args.migrations_path))?;
    print!(
        "{}",
        message(
            "setup-complete",
            &[
                ("dialect", args.dialect.name()),
                ("migrationsPath", &args.migrations_path),
                (
                    "createExample",
                    &format!(
                        "  cargo run --release --bin migrate-create -- --provider {} --name add_users",
                        args.dialect.name()
                    ),
                ),
                (
                    "upExample",
                    &format!(
                        "  cargo run --release --bin migrate-up -- --provider {} --connection {}",
                        args.dialect.name(),
                        args.connection
                    ),
                ),
            ],
        )
    );
    if args.and_up {
        let up = sibling_migrate_up_binary()?;
        let status = std::process::Command::new(&up)
            .arg("--provider")
            .arg(args.dialect.name())
            .arg("--connection")
            .arg(&args.connection)
            .arg("--migrations-path")
            .arg(&args.migrations_path)
            .status()?;
        if !status.success() {
            process::exit(status.code().unwrap_or(1));
        }
    }
    Ok(())
}
