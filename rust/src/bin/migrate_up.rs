// Default: applies ALL pending migrations in sequence, each in its own transaction. Pass --one to apply only the next pending migration (legacy one-shot behavior; useful when wrapping in an external loop or when you want to inspect state between steps).

use std::env;
use std::process;

use deterministic_migraters::{
    connection_from_env, fill_help_template, is_help, join_env_vars, message, take_value, try_get,
    IMigrater, Migrater, SqlDialect, UpArg,
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
        one,
    })
}

async fn apply_pending(args: &Args) -> Result<(), Box<dyn std::error::Error>> {
    let names = Migrater::new(args.dialect)
        .up(UpArg {
            connection: &args.connection,
            migrations_path: &args.migrate_path,
            one: args.one,
        })
        .await?;
    if names.is_empty() {
        print!("{}", message("status/no-pending", &[]));
        return Ok(());
    }
    for name in &names {
        print!("{}", message("status/applied", &[("name", name)]));
    }
    if !args.one {
        print!("{}", message("status/no-more-pending", &[]));
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
    apply_pending(&args).await
}
