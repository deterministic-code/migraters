// Rolls back the most recently applied migration (one step). DESTRUCTIVE: prints a random 4-letter uppercase token and refuses to proceed unless the operator types it back on stdin. Pass --confirm <TOKEN> matching the printed token to bypass the prompt (CI / scripted use).

use std::env;
use std::fs;
use std::io::{self, BufRead, IsTerminal, Write};
use std::process;
use std::time::Instant;

use deterministic_migraters::{
    assert_no_checksum_drift, connection_from_env, discover_up_files, down_path_for,
    fill_help_template, is_help, message, take_value, try_get, MigrationPool, SqlDialect,
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
        if is_help(&a) {
            eprint!("{}", help_text());
            process::exit(0);
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
        } else if let Some(v) = take_value(&a, &mut iter, "--confirm") {
            confirm = Some(v);
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
        confirm,
    })
}

fn random_token() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ";
    let mut buf = [0u8; 4];
    getrandom::getrandom(&mut buf).expect("rng");
    buf.iter()
        .map(|b| ALPHABET[(*b as usize) % ALPHABET.len()] as char)
        .collect()
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
    if !io::stdin().is_terminal() {
        let _ = writeln!(
            err,
            "{}",
            message("down/confirm-tty-required", &[("token", token)]),
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
            let _ = writeln!(err, "{}", message("down/confirm-stdin-failed", &[]),);
            process::exit(2);
        }
    }
    if line.trim() != token {
        let _ = writeln!(err, "{}", message("down/confirm-token-mismatch", &[]),);
        process::exit(2);
    }
}

async fn rollback_last(args: &Args) -> Result<(), Box<dyn std::error::Error>> {
    let pool = MigrationPool::connect(args.dialect, &args.connection).await?;
    let files = discover_up_files(&args.migrate_path)?;
    let applied = pool
        .fetch_applied(&args.dialect.select_applied_checksum_sql())
        .await?;
    if applied.is_empty() {
        print!("{}", message("status/no-rollback", &[]));
        return Ok(());
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
    let path = down_path_for(&args.migrate_path, &name)
        .ok_or_else(|| message("errors/rollback-no-down-sibling", &[("name", &name)]))?;
    let sql = fs::read_to_string(&path)?;
    let log_id = pool.insert_log_started(args.dialect, &name, "down").await?;
    let started = Instant::now();
    match pool
        .apply_statements(
            args.dialect,
            &sql,
            args.dialect.delete_applied_sql(),
            &name,
            None,
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
