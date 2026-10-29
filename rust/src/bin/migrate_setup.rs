// Idempotent CREATE TABLE IF NOT EXISTS migrates+migrate_logs via IMigrater.setup.

use std::env;
use std::process;

use deterministic_migraters::{
    connection_from_env, create_database, fill_help_template, is_help, join_env_vars, message,
    take_value, try_get, IMigrater, Migrater, SetupArg, SqlDialect, UpArg,
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
    create_database: bool,
    batch_separator: String,
}

fn parse_args() -> Result<Args, String> {
    let mut provider: Option<String> = None;
    let mut connection: Option<String> = None;
    let mut migrations_path: Option<String> = None;
    let mut and_up = false;
    let mut create_database = false;
    let mut batch_separator = String::from("GO");
    let mut iter = env::args().skip(1);
    while let Some(a) = iter.next() {
        if is_help(&a) {
            eprint!("{}", help_text());
            process::exit(0);
        }
        if a == "--and-up" {
            and_up = true;
            continue;
        }
        if a == "--create-database" {
            create_database = true;
            continue;
        }
        if let Some(v) = take_value(&a, &mut iter, "--provider") {
            provider = Some(v);
        } else if let Some(v) = take_value(&a, &mut iter, "--connection") {
            connection = Some(v);
        } else if let Some(v) = take_value(&a, &mut iter, "--migrations-path")
            .or_else(|| take_value(&a, &mut iter, "--migrate-path"))
        {
            migrations_path = Some(v);
        } else if let Some(v) = take_value(&a, &mut iter, "--batch-separator") {
            let token = v.trim();
            if token.is_empty() {
                return Err(message("errors/empty-batch-separator", &[]));
            }
            batch_separator = token.to_string();
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
    let connection = match connection.or_else(|| connection_from_env(dialect)) {
        Some(c) => c,
        None => {
            return Err(message(
                "errors/missing-connection",
                &[("envVars", &join_env_vars(dialect.connection_env_vars()))],
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
        create_database,
        batch_separator,
    })
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
    if args.create_database {
        create_database(args.dialect.name(), &args.connection).await?;
    }
    let migrater = Migrater::with_batch_separator(args.dialect, args.batch_separator.clone());
    migrater
        .setup(SetupArg {
            connection: &args.connection,
            migrations_path: &args.migrations_path,
        })
        .await?;
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
        let names = migrater
            .up(UpArg {
                connection: &args.connection,
                migrations_path: &args.migrations_path,
                one: false,
            })
            .await?;
        if names.is_empty() {
            print!("{}", message("status/no-pending", &[]));
        } else {
            for name in &names {
                print!("{}", message("status/applied", &[("name", name)]));
            }
            print!("{}", message("status/no-more-pending", &[]));
        }
    }
    Ok(())
}
