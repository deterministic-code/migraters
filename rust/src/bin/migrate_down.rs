// Rolls back the most recently applied migration (one step). DESTRUCTIVE: prints a random 4-letter uppercase token and refuses to proceed unless the operator types it back on stdin. Pass --confirm <TOKEN> matching the printed token to bypass the prompt (CI / scripted use).

use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;
use std::process;
use std::time::{SystemTime, UNIX_EPOCH};

use deterministic_migraters::{
    connection_from_env, fill_help_template, message, try_get, MigrationPool, SqlDialect,
    SUPPORTED_PROVIDERS,
};

const HELP_TEMPLATE: &str = include_str!("../../../shared/templates/help/down.txt");

fn help_text() -> String {
    fill_help_template(HELP_TEMPLATE, "migrate-down")
}

struct Args {
    dialect: &'static dyn SqlDialect,
    migrate_path: String,
    connection: String,
    confirm: Option<String>,
}

fn parse_args() -> Result<Args, String> {
    let mut provider: Option<String> = None;
    let mut migrate_path: Option<String> = None;
    let mut migrate_root: Option<String> = None;
    let mut connection: Option<String> = None;
    let mut confirm: Option<String> = None;
    let mut iter = env::args().skip(1);
    while let Some(a) = iter.next() {
        match a.as_str() {
            "--provider" => provider = iter.next(),
            "--migrations-path" => migrate_path = iter.next(),
            "--migrate-path" => migrate_path = iter.next(),
            "--migrations-root" => migrate_root = iter.next(),
            "--migrate-root" => migrate_root = iter.next(),
            "--connection" => connection = iter.next(),
            "--confirm" => confirm = iter.next(),
            "-h" | "--help" => {
                eprint!("{}", help_text());
                process::exit(0);
            }
            other => {
                return Err(message("errors/unknown-arg", &[("arg", other)]));
            }
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
        confirm,
    })
}

fn discover_down_files(
    migrate_path: &str,
) -> Result<HashMap<String, PathBuf>, Box<dyn std::error::Error>> {
    let dir = PathBuf::from(migrate_path);
    if !dir.is_dir() {
        return Err(message("errors/migrate-path-not-dir", &[("path", migrate_path)]).into());
    }
    let mut out: HashMap<String, PathBuf> = HashMap::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|s| s.to_str()) {
            Some(n) if n.ends_with("_down.sql") => n.to_string(),
            _ => continue,
        };
        let stem = name[..name.len() - "_down.sql".len()].to_string();
        let up_name = format!("{}_up.sql", stem);
        out.insert(up_name, path);
    }
    Ok(out)
}

fn random_token() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ";
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut seed: u64 = ((nanos as u64) ^ (std::process::id() as u64)).max(1);
    let mut out = String::with_capacity(4);
    for _ in 0..4 {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        let idx = (seed as usize) % ALPHABET.len();
        out.push(ALPHABET[idx] as char);
    }
    out
}

fn confirm_or_abort(dialect: &str, token: &str, confirm: Option<&str>) {
    let stderr = io::stderr();
    let mut err = stderr.lock();
    let _ = write!(
        err,
        "{}",
        message(
            "down/destructive-header",
            &[("dialect", dialect), ("token", token)],
        ),
    );
    if let Some(supplied) = confirm {
        if supplied == token {
            return;
        }
        let _ = writeln!(
            err,
            "{}",
            message(
                "down/confirm-mismatch",
                &[("supplied", supplied), ("token", token)],
            ),
        );
        process::exit(2);
    }
    let _ = write!(
        err,
        "{}",
        message("down/confirm-prompt", &[("token", token)]),
    );
    let _ = err.flush();
    let stdin = io::stdin();
    let mut line = String::new();
    match stdin.lock().read_line(&mut line) {
        Ok(_) => {}
        Err(_) => {
            let _ = writeln!(
                err,
                "{}",
                message("down/confirm-stdin-failed", &[]),
            );
            process::exit(2);
        }
    }
    if line.trim() != token {
        let _ = writeln!(
            err,
            "{}",
            message("down/confirm-token-mismatch", &[]),
        );
        process::exit(2);
    }
}

async fn rollback_last(args: &Args) -> Result<(), Box<dyn std::error::Error>> {
    let pool = MigrationPool::connect(args.dialect, &args.connection).await?;
    let name = match pool
        .fetch_optional_string(args.dialect.select_last_applied_sql())
        .await?
    {
        Some(n) => n,
        None => {
            print!("{}", message("status/no-rollback", &[]));
            return Ok(());
        }
    };
    let downs = discover_down_files(&args.migrate_path)?;
    let path = downs
        .get(&name)
        .ok_or_else(|| {
            message(
                "errors/rollback-no-down-sibling",
                &[("name", &name)],
            )
        })?
        .clone();
    let sql = fs::read_to_string(&path)?;
    pool.apply_statements(
        args.dialect,
        &sql,
        args.dialect.delete_applied_sql(),
        &name,
        None,
    )
    .await?;
    print!("{}", message("status/rolled-back", &[("name", &name)]));
    Ok(())
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
    let token = random_token();
    confirm_or_abort(args.dialect.name(), &token, args.confirm.as_deref());
    rollback_last(&args).await
}
