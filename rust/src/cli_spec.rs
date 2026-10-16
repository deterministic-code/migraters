use std::collections::HashMap;
use std::sync::OnceLock;

const RAW: &str = include_str!("../../cli.yaml");

#[derive(Clone)]
struct CliArg {
    flag: String,
    placeholder: Option<String>,
    required: bool,
}

#[derive(Clone)]
struct CliCommand {
    verb: String,
    args: Vec<CliArg>,
}

struct CliSpec {
    command: String,
    providers: Vec<String>,
    provider_aliases: HashMap<String, String>,
    env_var_list_separator: String,
    commands: Vec<CliCommand>,
}

fn spec() -> &'static CliSpec {
    static SPEC: OnceLock<CliSpec> = OnceLock::new();
    SPEC.get_or_init(parse_cli_yaml)
}

fn parse_arg_flow(line: &str) -> CliArg {
    let start = line.find('{').expect("cli.yaml arg mapping");
    let end = line.rfind('}').expect("cli.yaml arg mapping");
    let mut flag = String::new();
    let mut placeholder = None;
    let mut required = false;
    for part in line[start + 1..end].split(',') {
        let Some((key, value)) = part.split_once(':') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        match key {
            "flag" => flag = value.to_string(),
            "placeholder" => placeholder = Some(value.to_string()),
            "required" => required = value == "true",
            _ => {}
        }
    }
    CliArg {
        flag,
        placeholder,
        required,
    }
}

fn unquote(value: &str) -> String {
    let v = value.trim();
    if let Some(inner) = v.strip_prefix('"').and_then(|s| s.strip_suffix('"')) {
        inner.to_string()
    } else {
        v.to_string()
    }
}

fn parse_cli_yaml() -> CliSpec {
    let mut command = String::from("migrate-{verb}");
    let mut providers = Vec::new();
    let mut provider_aliases = HashMap::new();
    let mut env_var_list_separator = String::from(" / ");
    let mut commands = Vec::new();
    let mut in_providers = false;
    let mut in_aliases = false;
    let mut in_commands = false;
    let mut current: Option<CliCommand> = None;
    let mut in_args = false;

    for raw in RAW.lines() {
        let line = raw.trim_end();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if !line.starts_with(' ') && !line.starts_with('-') {
            in_providers = false;
            in_aliases = false;
            if !line.starts_with("commands:") {
                in_commands = false;
                in_args = false;
                if let Some(cmd) = current.take() {
                    commands.push(cmd);
                }
            }
        }
        if line.starts_with("command:") {
            command = line.split_once(':').unwrap().1.trim().to_string();
            continue;
        }
        if line.starts_with("env_var_list_separator:") {
            env_var_list_separator = unquote(line.split_once(':').unwrap().1);
            continue;
        }
        if line.starts_with("providers:") {
            in_providers = true;
            continue;
        }
        if line.starts_with("provider_aliases:") {
            in_aliases = true;
            continue;
        }
        if line.starts_with("commands:") {
            in_commands = true;
            continue;
        }
        if in_providers {
            if let Some(name) = line.trim().strip_prefix("- ") {
                providers.push(name.trim().to_string());
            }
            continue;
        }
        if in_aliases {
            let trimmed = line.trim();
            if let Some((alias, canonical)) = trimmed.split_once(':') {
                let alias = crate::provider::strip_key(alias.trim());
                let canonical = canonical.trim().to_string();
                if !alias.is_empty() && !canonical.is_empty() {
                    provider_aliases.insert(alias, canonical);
                }
            }
            continue;
        }
        if !in_commands {
            continue;
        }
        let trimmed = line.trim();
        if let Some(verb) = trimmed.strip_prefix("- verb:") {
            if let Some(cmd) = current.take() {
                commands.push(cmd);
            }
            current = Some(CliCommand {
                verb: verb.trim().to_string(),
                args: Vec::new(),
            });
            in_args = false;
            continue;
        }
        if trimmed == "args:" {
            in_args = true;
            continue;
        }
        if in_args && trimmed.starts_with("- {") {
            if let Some(cmd) = current.as_mut() {
                cmd.args.push(parse_arg_flow(trimmed));
            }
        } else if in_args {
            if let Some(flag) = trimmed.strip_prefix("- flag:") {
                if let Some(cmd) = current.as_mut() {
                    cmd.args.push(CliArg {
                        flag: flag.trim().to_string(),
                        placeholder: None,
                        required: false,
                    });
                }
            } else if let Some(cmd) = current.as_mut() {
                if let Some(last) = cmd.args.last_mut() {
                    if let Some(placeholder) = trimmed.strip_prefix("placeholder:") {
                        last.placeholder = Some(placeholder.trim().to_string());
                    } else if let Some(required) = trimmed.strip_prefix("required:") {
                        last.required = required.trim() == "true";
                    }
                }
            }
        }
    }
    if let Some(cmd) = current.take() {
        commands.push(cmd);
    }
    CliSpec {
        command,
        providers,
        provider_aliases,
        env_var_list_separator,
        commands,
    }
}

fn arg_usage(arg: &CliArg, providers: &str) -> String {
    let body = match &arg.placeholder {
        Some(token) if token == "providers" => format!("{} <{}>", arg.flag, providers),
        Some(token) => format!("{} <{}>", arg.flag, token),
        None => arg.flag.clone(),
    };
    if arg.required {
        body
    } else {
        format!("[{body}]")
    }
}

pub fn usage_line(verb: &str) -> String {
    let spec = spec();
    let providers = spec.providers.join("|");
    let command_name = spec.command.replace("{verb}", verb);
    let command = spec
        .commands
        .iter()
        .find(|c| c.verb == verb)
        .unwrap_or_else(|| panic!("cli.yaml: missing command {verb}"));
    let args = command
        .args
        .iter()
        .map(|a| arg_usage(a, &providers))
        .collect::<Vec<_>>()
        .join(" ");
    format!("Usage: {command_name} {args}")
}

pub fn providers() -> &'static [String] {
    &spec().providers
}

pub fn provider_aliases() -> &'static HashMap<String, String> {
    &spec().provider_aliases
}

pub fn env_var_list_separator() -> &'static str {
    spec().env_var_list_separator.as_str()
}

pub fn join_env_vars(vars: &[&str]) -> String {
    vars.join(env_var_list_separator())
}
