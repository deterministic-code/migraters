// Default: applies ALL pending migrations in sequence, each in its own transaction. Pass --one to apply only the next pending migration (legacy one-shot behavior; useful when wrapping in an external loop or when you want to inspect state between steps).

use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process;

use deterministic_migraters::{
    checksum_hex, connection_from_env, fill_help_template, message, try_get, MigrationPool, SqlDialect,
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
        match a.as_str() {
            "--provider" => provider = iter.next(),
            "--migrations-path" => migrate_path = iter.next(),
            "--migrate-path" => migrate_path = iter.next(),
            "--migrations-root" => migrate_root = iter.next(),
            "--migrate-root" => migrate_root = iter.next(),
            "--connection" => connection = iter.next(),
            "--one" => one = true,
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

fn discover_up_files(
    migrate_path: &str,
) -> Result<Vec<(String, PathBuf)>, Box<dyn std::error::Error>> {
    let dir = PathBuf::from(migrate_path);
    if !dir.is_dir() {
        return Err(message("errors/migrate-path-not-dir", &[("path", migrate_path)]).into());
    }
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|s| s.to_str()) {
            Some(n) if n.ends_with("_up.sql") => n.to_string(),
            _ => continue,
        };
        out.push((name, path));
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

async fn apply_pending(args: &Args) -> Result<(), Box<dyn std::error::Error>> {
    let pool = MigrationPool::connect(args.dialect, &args.connection).await?;
    let mut applied_set: HashSet<String> = pool
        .fetch_strings(args.dialect.select_applied_sql())
        .await?
        .into_iter()
        .collect();
    let files = discover_up_files(&args.migrate_path)?;
    let mut applied_count = 0usize;
    loop {
        let next = files
            .iter()
            .find(|(n, _)| !applied_set.contains(n))
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
        pool.apply_statements(
            args.dialect,
            &sql,
            args.dialect.insert_applied_sql(),
            &name,
            Some(&sum),
        )
        .await?;
        print!("{}", message("status/applied", &[("name", &name)]));
        applied_set.insert(name);
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
