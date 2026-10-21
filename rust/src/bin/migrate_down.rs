// Rolls back the most recently applied migration (one step). DESTRUCTIVE: refuses to proceed unless the operator types confirm on stdin, or passes --confirm.

use std::env;
use std::io::{self, BufRead, IsTerminal, Write};
use std::process;

use deterministic_migraters::{
    connection_from_env, fill_help_template, is_help, join_env_vars, message, take_value, try_get,
    DownArg, IMigrater, Migrater, SqlDialect,
};

const HELP_TEMPLATE: &str = include_str!("../../../shared/templates/help/down.txt");

fn help_text() -> String {
    fill_help_template(HELP_TEMPLATE, "migrate-down")
}

struct Args {
    dialect: &'static dyn SqlDialect,
    migrate_path: String,
    connection: String,
    confirm: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut provider: Option<String> = None;
    let mut migrate_path: Option<String> = None;
    let mut migrate_root: Option<String> = None;
    let mut connection: Option<String> = None;
    let mut confirm = false;
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
        } else if a == "--confirm" {
            confirm = true;
        } else {
            return Err(message("errors/unknown-arg", &[("arg", &a)]));
        }
    }
    let Some(provider) = provider else {
        return Err(message("errors/missing-provider", &[]));
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
                &[("envVars", &join_env_vars(dialect.connection_env_vars()))],
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

fn confirm_or_abort(dialect: &str, confirm: bool) {
    let stderr = io::stderr();
    let mut err = stderr.lock();
    let _ = write!(
        err,
        "{}",
        message("down/destructive-header", &[("dialect", dialect)]),
    );
    if confirm {
        return;
    }
    if !io::stdin().is_terminal() {
        let _ = writeln!(err, "{}", message("down/confirm-tty-required", &[]),);
        process::exit(2);
    }
    let _ = write!(err, "{}", message("down/confirm-prompt", &[]),);
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
    if line.trim() != "confirm" {
        let _ = writeln!(err, "{}", message("down/confirm-token-mismatch", &[]),);
        process::exit(2);
    }
}

async fn rollback_last(args: &Args) -> Result<(), Box<dyn std::error::Error>> {
    match Migrater::new(args.dialect)
        .down(DownArg {
            connection: &args.connection,
            migrations_path: &args.migrate_path,
        })
        .await?
    {
        None => print!("{}", message("status/no-rollback", &[])),
        Some(name) => print!("{}", message("status/rolled-back", &[("name", &name)])),
    }
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
    confirm_or_abort(args.dialect.name(), args.confirm);
    rollback_last(&args).await
}
