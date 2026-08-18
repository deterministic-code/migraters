// Rolls back the most recently applied migration (one step). DESTRUCTIVE: prints a random 4-letter uppercase token and refuses to proceed unless the operator types it back on stdin. Pass --confirm <TOKEN> matching the printed token to bypass the prompt (CI / scripted use).

use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;
use std::process;
use std::time::{SystemTime, UNIX_EPOCH};

use deterministic_migraters::{connection_from_env, try_get, MigrationPool, SqlDialect};

const HELP_TEMPLATE: &str = include_str!("../../../templates/help/down.txt");

fn help_text() -> String {
    HELP_TEMPLATE.replace("{{command}}", "migrate-down")
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
            other => return Err(format!("unknown arg: {}", other)),
        }
    }
    let Some(provider) = provider else {
        return Err("missing --provider — pass --provider <sqlite|postgres|mysql>. Run with --help for examples.".to_string());
    };
    let Some(dialect) = try_get(&provider) else {
        return Err(format!("unsupported provider: {}", provider));
    };
    let migrate_path = migrate_path.unwrap_or_else(|| {
        let root = migrate_root.unwrap_or_else(|| "sql".to_string());
        format!("{}/{}/migrations", root, dialect.name())
    });
    let connection = match connection.or_else(|| connection_from_env(dialect)) {
        Some(c) => c,
        None => {
            return Err(format!(
                "missing --connection — pass --connection <url> (e.g. ./app.sqlite for sqlite) or set one of: {}. Run with --help for examples.",
                dialect.connection_env_vars().join(", ")
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
        return Err(format!("migrate-path is not a directory: {}", migrate_path).into());
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

fn confirm_or_abort(token: &str, confirm: Option<&str>) {
    let stderr = io::stderr();
    let mut err = stderr.lock();
    let _ = writeln!(
        err,
        "\n⚠ DESTRUCTIVE: this rolls back the most recently applied migration.\n  Confirmation token: {}\n",
        token,
    );
    if let Some(supplied) = confirm {
        if supplied == token {
            return;
        }
        let _ = writeln!(
            err,
            "--confirm value ({}) does not match the token printed above ({}). Aborting.",
            supplied, token,
        );
        process::exit(2);
    }
    let _ = write!(err, "Type {} to confirm rollback: ", token);
    let _ = err.flush();
    let stdin = io::stdin();
    let mut line = String::new();
    match stdin.lock().read_line(&mut line) {
        Ok(_) => {}
        Err(_) => {
            let _ = writeln!(err, "failed to read confirmation from stdin — aborting.");
            process::exit(2);
        }
    }
    if line.trim() != token {
        let _ = writeln!(err, "Confirmation token did not match — aborting.");
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
            println!("No applied migrations to roll back.");
            return Ok(());
        }
    };
    let downs = discover_down_files(&args.migrate_path)?;
    let path = downs
        .get(&name)
        .ok_or_else(|| {
            format!(
                "Cannot roll back \"{}\": no <stem>_down.sql sibling found",
                name
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
    println!("Rolled back: {}", name);
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
    confirm_or_abort(&token, args.confirm.as_deref());
    rollback_last(&args).await
}
