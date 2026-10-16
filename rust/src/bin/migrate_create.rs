// Scaffolds a new <NNNN>_<name>_{up,down}.sql pair in the migrations directory. Numbering is max(1-4-digit prefix in dir)+1; legacy timestamp prefixes are ignored.

use std::env;
use std::process;

use deterministic_migraters::{
    fill_help_template, is_help, is_migration_name, message, take_value, try_get, CreateArg,
    IMigrater, Migrater, SqlDialect,
};

const HELP_TEMPLATE: &str = include_str!("../../../shared/templates/help/create.txt");

fn help_text() -> String {
    fill_help_template(HELP_TEMPLATE, "migrate-create")
}

struct Args {
    dialect: &'static dyn SqlDialect,
    name: String,
    migrations_path: String,
}

fn parse_args() -> Result<Args, String> {
    let mut provider: Option<String> = None;
    let mut name: Option<String> = None;
    let mut migrations_path: Option<String> = None;
    let mut iter = env::args().skip(1);
    while let Some(a) = iter.next() {
        if is_help(&a) {
            eprint!("{}", help_text());
            process::exit(0);
        }
        if let Some(v) = take_value(&a, &mut iter, "--provider") {
            provider = Some(v);
        } else if let Some(v) = take_value(&a, &mut iter, "--name") {
            name = Some(v);
        } else if let Some(v) = take_value(&a, &mut iter, "--migrations-path")
            .or_else(|| take_value(&a, &mut iter, "--migrate-path"))
        {
            migrations_path = Some(v);
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
    let Some(name) = name else {
        return Err(message("errors/missing-name", &[]));
    };
    if !is_migration_name(&name) {
        return Err(message("errors/invalid-name", &[("name", &name)]));
    }
    let migrations_path =
        migrations_path.unwrap_or_else(|| format!("./sql/{}/migrations", dialect.name()));
    Ok(Args {
        dialect,
        name,
        migrations_path,
    })
}

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(msg) => {
            eprintln!("{}", msg);
            process::exit(2);
        }
    };
    if let Err(e) = run(&args) {
        eprintln!("{}", e);
        process::exit(1);
    }
}

fn run(args: &Args) -> Result<(), Box<dyn std::error::Error>> {
    let created = Migrater::new(args.dialect).create(CreateArg {
        name: &args.name,
        migrations_path: &args.migrations_path,
    })?;
    print!(
        "{}",
        message("status/created", &[("file", &created.up_name)])
    );
    print!(
        "{}",
        message("status/created", &[("file", &created.down_name)])
    );
    Ok(())
}
