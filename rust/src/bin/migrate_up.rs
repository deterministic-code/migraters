// Default: applies ALL pending migrations in sequence, each in its own transaction. Pass --one to apply only the next pending migration (legacy one-shot behavior; useful when wrapping in an external loop or when you want to inspect state between steps).

use std::env;
use std::fs;
use std::process;
use std::time::Instant;

use deterministic_migraters::{
    assert_no_checksum_drift, checksum_hex, connection_from_env, discover_up_files,
    fill_help_template, is_help, message, take_value, try_get, MigrationPool, SqlDialect,
    SUPPORTED_PROVIDERS,
};

const HELP_TEMPLATE: &str = include_str!("../../../shared/templates/help/up.txt");

fn help_text() -> String {
    fill_help_template(HELP_TEMPLATE, "migrate-up")
}

struct Args {
    dialect: &'static dyn SqlDialect,
    migrate_path: String,
    connection: String,
    one: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut provider: Option<String> = None;
    let mut migrate_path: Option<String> = None;
    let mut migrate_root: Option<String> = None;
    let mut connection: Option<String> = None;
    let mut one = false;
    let mut iter = env::args().skip(1);
    while let Some(a) = iter.next() {
        if is_help(&a) {
            eprint!("{}", help_text());
            process::exit(0);
        }
        if a == "--one" {
            one = true;
            continue;
        }
        if let Some(v) = take_value(&a, &mut iter, "--provider") {
            provider = Some(v);
        } else if let Some(v) = take_value(&a, &mut iter, "--migrations-path")
            .or_else(|| take_value(&a, &mut iter, "--migrate-path"))
        {
            migrate_path = Some(v);
        } else if let Some(v) = take_value(&a, &mut iter, "--migrations-root")
            .or_else(|| take_value(&a, &mut iter, "--migrate-root"))
        {
            migrate_root = Some(v);
        } else if let Some(v) = take_value(&a, &mut iter, "--connection") {
            connection = Some(v);
        } else {
            return Err(message("errors/unknown-arg", &[("arg", &a)]));
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
    let migrate_path = migrate_path.unwrap_or_else(|| {
        let root = migrate_root.unwrap_or_else(|| "sql".to_string());
        format!("{}/{}/migrations", root, dialect.name())
    });
    let connection = match connection.or_else(|| connection_from_env(dialect)) {
        Some(c) => c,
        None => {
            return Err(message(
                "errors/missing-connection",
                &[("envVars", &dialect.connection_env_vars().join(", "))],
            ))
        }
    };
    Ok(Args {
        dialect,
        migrate_path,
        connection,
        one,
    })
}

async fn apply_pending(args: &Args) -> Result<(), Box<dyn std::error::Error>> {
    let pool = MigrationPool::connect(args.dialect, &args.connection).await?;
    let files = discover_up_files(&args.migrate_path)?;
    let mut applied = pool
        .fetch_applied(&args.dialect.select_applied_checksum_sql())
        .await?;
    assert_no_checksum_drift(&files, &applied)?;
    let mut applied_count = 0usize;
    loop {
        let next = files
            .iter()
            .find(|(n, _)| !applied.contains_key(n))
            .cloned();
        let (name, path) = match next {
            Some(t) => t,
            None => {
                if applied_count == 0 {
                    print!("{}", message("status/no-pending", &[]));
                } else {
                    print!("{}", message("status/no-more-pending", &[]));
                }
                return Ok(());
            }
        };
        let sql = fs::read_to_string(&path)?;
        let sum = checksum_hex(&sql);
        let log_id = pool.insert_log_started(args.dialect, &name, "up").await?;
        let started = Instant::now();
        match pool
            .apply_statements(
                args.dialect,
                &sql,
                args.dialect.insert_applied_sql(),
                &name,
                Some(&sum),
            )
            .await
        {
            Ok(()) => {
                let _ = pool
                    .update_log(
                        args.dialect,
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
                        args.dialect,
                        log_id,
                        "error",
                        started.elapsed().as_millis() as i64,
                        Some(&e.to_string()),
                    )
                    .await;
                return Err(e);
            }
        }
        print!("{}", message("status/applied", &[("name", &name)]));
        applied.insert(name, Some(sum));
        applied_count += 1;
        if args.one {
            return Ok(());
        }
    }
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
    if let Some(msg) = args.dialect.prerequisite_error(&args.connection) {
        eprintln!("{}", msg);
        process::exit(2);
    }
    apply_pending(&args).await
}
