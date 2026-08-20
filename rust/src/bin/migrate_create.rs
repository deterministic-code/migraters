// Scaffolds a new <NNNN>_<name>_{up,down}.sql pair in the migrations directory. Numbering is max(1-4-digit prefix in dir)+1; legacy timestamp prefixes are ignored.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process;

use deterministic_migraters::{fill_help_template, message, scaffold, try_get, SUPPORTED_PROVIDERS};

const HELP_TEMPLATE: &str = include_str!("../../../shared/templates/help/create.txt");

fn help_text() -> String {
    fill_help_template(HELP_TEMPLATE, "migrate-create")
}

struct Args {
    name: String,
    migrations_path: String,
}

fn parse_args() -> Result<Args, String> {
    let mut provider: Option<String> = None;
    let mut name: Option<String> = None;
    let mut migrations_path: Option<String> = None;
    let mut iter = env::args().skip(1);
    while let Some(a) = iter.next() {
        match a.as_str() {
            "--provider" => provider = iter.next(),
            "--name" => name = iter.next(),
            // --migrate-path is a silent alias retained for backward compat.
            "--migrations-path" => migrations_path = iter.next(),
            "--migrate-path" => migrations_path = iter.next(),
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
    let Some(name) = name else {
        return Err(message("errors/missing-name-hint", &[]));
    };
    if !is_snake_case(&name) {
        return Err(message("errors/invalid-name", &[("name", &name)]));
    }
    let migrations_path =
        migrations_path.unwrap_or_else(|| format!("./sql/{}/migrations", dialect.name()));
    Ok(Args {
        name,
        migrations_path,
    })
}

fn is_snake_case(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

// Bounded to 1-4 digits so legacy timestamp prefixes (10+ digits, e.g. 1767261600_initial_up.sql) do not poison numbering.
fn parse_sequence(filename: &str) -> Option<u32> {
    if !filename.ends_with("_up.sql") {
        return None;
    }
    let bytes = filename.as_bytes();
    let mut end = 0usize;
    while end < bytes.len() && end < 4 && bytes[end].is_ascii_digit() {
        end += 1;
    }
    if end == 0 {
        return None;
    }
    if end >= bytes.len() || bytes[end] != b'_' {
        return None;
    }
    // Reject 5+ digit prefixes (the 5th char must NOT be a digit).
    if end == 4 && bytes.len() > 4 && bytes[4].is_ascii_digit() {
        return None;
    }
    filename[..end].parse::<u32>().ok()
}

fn next_sequence(dir: &str) -> Result<u32, Box<dyn std::error::Error>> {
    let path = PathBuf::from(dir);
    if !path.is_dir() {
        return Ok(1);
    }
    let mut max = 0u32;
    for entry in fs::read_dir(&path)? {
        let entry = entry?;
        let name = match entry.file_name().into_string() {
            Ok(s) => s,
            Err(_) => continue,
        };
        if let Some(n) = parse_sequence(&name) {
            if n > max {
                max = n;
            }
        }
    }
    Ok(max + 1)
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
    let dir = PathBuf::from(&args.migrations_path);
    fs::create_dir_all(&dir)?;
    let seq = next_sequence(&args.migrations_path)?;
    let prefix = format!("{:04}", seq);
    let up_name = format!("{}_{}_up.sql", prefix, args.name);
    let down_name = format!("{}_{}_down.sql", prefix, args.name);
    let name = args.name.as_str();
    fs::write(dir.join(&up_name), scaffold("up", &[("name", name)]))?;
    fs::write(dir.join(&down_name), scaffold("down", &[("name", name)]))?;
    print!("{}", message("status/created", &[("file", &up_name)]));
    print!("{}", message("status/created", &[("file", &down_name)]));
    Ok(())
}
