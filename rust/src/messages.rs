pub const SUPPORTED_PROVIDERS: &str = "sqlite|postgres|mysql";

pub fn fill_template(template: &str, vars: &[(&str, &str)]) -> String {
    let mut out = template.to_string();
    for (key, value) in vars {
        out = out.replace(&format!("{{{{{key}}}}}"), value);
    }
    out
}

fn raw_message(path: &str) -> &'static str {
    match path {
        "setup-complete" => include_str!("../../shared/templates/messages/setup-complete.txt"),
        "status/no-pending" => include_str!("../../shared/templates/messages/status/no-pending.txt"),
        "status/no-more-pending" => {
            include_str!("../../shared/templates/messages/status/no-more-pending.txt")
        }
        "status/applied" => include_str!("../../shared/templates/messages/status/applied.txt"),
        "status/created" => include_str!("../../shared/templates/messages/status/created.txt"),
        "status/rolled-back" => include_str!("../../shared/templates/messages/status/rolled-back.txt"),
        "status/no-rollback" => include_str!("../../shared/templates/messages/status/no-rollback.txt"),
        "down/destructive-header" => {
            include_str!("../../shared/templates/messages/down/destructive-header.txt")
        }
        "down/confirm-mismatch" => {
            include_str!("../../shared/templates/messages/down/confirm-mismatch.txt")
        }
        "down/confirm-tty-required" => {
            include_str!("../../shared/templates/messages/down/confirm-tty-required.txt")
        }
        "down/confirm-prompt" => include_str!("../../shared/templates/messages/down/confirm-prompt.txt"),
        "down/confirm-stdin-failed" => {
            include_str!("../../shared/templates/messages/down/confirm-stdin-failed.txt")
        }
        "down/confirm-token-mismatch" => {
            include_str!("../../shared/templates/messages/down/confirm-token-mismatch.txt")
        }
        "errors/missing-provider" => {
            include_str!("../../shared/templates/messages/errors/missing-provider.txt")
        }
        "errors/missing-provider-hint" => {
            include_str!("../../shared/templates/messages/errors/missing-provider-hint.txt")
        }
        "errors/missing-connection" => {
            include_str!("../../shared/templates/messages/errors/missing-connection.txt")
        }
        "errors/missing-name" => include_str!("../../shared/templates/messages/errors/missing-name.txt"),
        "errors/missing-name-hint" => {
            include_str!("../../shared/templates/messages/errors/missing-name-hint.txt")
        }
        "errors/invalid-name" => include_str!("../../shared/templates/messages/errors/invalid-name.txt"),
        "errors/unknown-arg" => include_str!("../../shared/templates/messages/errors/unknown-arg.txt"),
        "errors/unsupported-provider" => {
            include_str!("../../shared/templates/messages/errors/unsupported-provider.txt")
        }
        "errors/missing-value-for-flag" => {
            include_str!("../../shared/templates/messages/errors/missing-value-for-flag.txt")
        }
        "errors/migrate-path-not-dir" => {
            include_str!("../../shared/templates/messages/errors/migrate-path-not-dir.txt")
        }
        "errors/rollback-no-down-sibling" => {
            include_str!("../../shared/templates/messages/errors/rollback-no-down-sibling.txt")
        }
        "errors/sqlite-prerequisite" => {
            include_str!("../../shared/templates/messages/errors/sqlite-prerequisite.txt")
        }
        _ => panic!("unknown message template: {path}"),
    }
}

pub fn message(path: &str, vars: &[(&str, &str)]) -> String {
    fill_template(raw_message(path), vars)
}

pub fn scaffold(name: &str, vars: &[(&str, &str)]) -> String {
    let template = match name {
        "up" => include_str!("../../shared/templates/scaffold/up.sql"),
        "down" => include_str!("../../shared/templates/scaffold/down.sql"),
        _ => panic!("unknown scaffold template: {name}"),
    };
    fill_template(template, vars)
}
