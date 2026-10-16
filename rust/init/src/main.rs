use std::collections::{BTreeSet, HashMap};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process;

const CLI_YAML: &str = include_str!("../../../cli.yaml");
const HELP_TEMPLATE: &str = include_str!("../../../shared/templates/help/init.txt");

fn main() {
    match run(env::args().skip(1).collect()) {
        Ok(message) => print!("{message}"),
        Err((code, message)) => {
            eprint!("{message}");
            process::exit(code);
        }
    }
}

fn run(args: Vec<String>) -> Result<String, (i32, String)> {
    let parsed = parse_args(&args)?;
    let dialects = resolve_dialects(&parsed)?;
    let cargo_toml = cargo_toml_path();
    let raw = fs::read_to_string(&cargo_toml)
        .map_err(|e| (1, format!("failed to read {}: {e}\n", cargo_toml.display())))?;
    let next = set_default_features(&raw, &dialects).map_err(|e| (1, format!("{e}\n")))?;
    fs::write(&cargo_toml, next).map_err(|e| {
        (
            1,
            format!("failed to write {}: {e}\n", cargo_toml.display()),
        )
    })?;
    Ok(format!(
        "Enabled dialects: {}\nWrote {}\n",
        dialects.join(", "),
        cargo_toml.display()
    ))
}

struct Parsed {
    dialects: Vec<String>,
    all: bool,
}

fn parse_args(args: &[String]) -> Result<Parsed, (i32, String)> {
    let mut dialects = Vec::new();
    let mut all = false;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if arg == "-h" || arg == "--help" {
            eprint!("{}", help_text());
            process::exit(0);
        }
        if arg == "--all" {
            all = true;
            continue;
        }
        if let Some(value) = take_value(arg, &mut iter, "--dialect") {
            dialects.push(value);
            continue;
        }
        return Err((2, format!("unknown arg: {arg}\n")));
    }
    Ok(Parsed { dialects, all })
}

fn take_value<'a>(
    arg: &str,
    iter: &mut impl Iterator<Item = &'a String>,
    flag: &str,
) -> Option<String> {
    if arg == flag {
        return iter.next().cloned();
    }
    let prefix = format!("{flag}=");
    arg.strip_prefix(&prefix).map(str::to_string)
}

fn resolve_dialects(parsed: &Parsed) -> Result<Vec<String>, (i32, String)> {
    let (providers, aliases) = providers_and_aliases();
    if parsed.all {
        return Ok(providers);
    }
    if parsed.dialects.is_empty() {
        return Err((
            2,
            "pass --dialect <provider> at least once, or --all\n".into(),
        ));
    }
    let mut selected = BTreeSet::new();
    for raw in &parsed.dialects {
        match normalize_provider(raw, &providers, &aliases) {
            Some(name) => {
                selected.insert(name.to_string());
            }
            None => return Err((2, format!("unsupported provider: {raw}\n"))),
        }
    }
    Ok(selected.into_iter().collect())
}

fn strip_key(raw: &str) -> String {
    raw.chars()
        .filter(|c| !matches!(c, ' ' | '_' | '-'))
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn normalize_provider<'a>(
    raw: &str,
    providers: &'a [String],
    aliases: &'a HashMap<String, String>,
) -> Option<&'a str> {
    let key = strip_key(raw);
    if let Some(name) = providers.iter().find(|p| strip_key(p) == key) {
        return Some(name.as_str());
    }
    aliases.get(&key).map(|s| s.as_str())
}

fn providers_and_aliases() -> (Vec<String>, HashMap<String, String>) {
    let mut providers = Vec::new();
    let mut aliases = HashMap::new();
    let mut in_providers = false;
    let mut in_aliases = false;
    for raw in CLI_YAML.lines() {
        let line = raw.trim_end();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if !line.starts_with(' ') && !line.starts_with('-') {
            in_providers = false;
            in_aliases = false;
        }
        if line.starts_with("providers:") {
            in_providers = true;
            continue;
        }
        if line.starts_with("provider_aliases:") {
            in_aliases = true;
            continue;
        }
        if in_providers {
            if let Some(name) = line.trim().strip_prefix("- ") {
                providers.push(name.trim().to_string());
            }
            continue;
        }
        if in_aliases {
            if let Some((alias, canonical)) = line.trim().split_once(':') {
                let alias = strip_key(alias.trim());
                let canonical = canonical.trim().to_string();
                if !alias.is_empty() && !canonical.is_empty() {
                    aliases.insert(alias, canonical);
                }
            }
        }
    }
    (providers, aliases)
}

fn cargo_toml_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../Cargo.toml")
}

fn set_default_features(cargo_toml: &str, dialects: &[String]) -> Result<String, String> {
    let features = dialects
        .iter()
        .map(|d| format!("\"{d}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let replacement = format!("default = [{features}]");
    let mut out = String::new();
    let mut replaced = false;
    for line in cargo_toml.lines() {
        if !replaced && line.trim_start().starts_with("default = [") {
            let indent_len = line.len() - line.trim_start().len();
            out.push_str(&line[..indent_len]);
            out.push_str(&replacement);
            out.push('\n');
            replaced = true;
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    if !replaced {
        return Err("Cargo.toml is missing a features default = [...] line".into());
    }
    if !cargo_toml.ends_with('\n') {
        out.pop();
    }
    Ok(out)
}

fn help_text() -> String {
    let (providers, _) = providers_and_aliases();
    let usage = format!(
        "Usage: migrate-init [--dialect <{}>] [--all]",
        providers.join("|")
    );
    HELP_TEMPLATE
        .replace("{{usage}}", &usage)
        .replace("{{command}}", "migrate-init")
}
