use crate::messages::fill_template;
use crate::cli_spec::{program_usage as spec_program_usage, usage_line};

pub fn fill_help_template(template: &str, command: &str) -> String {
    let verb = command
        .strip_prefix("migrate-")
        .expect("help command must be migrate-<verb>");
    let usage = usage_line(verb);
    fill_template(template, &[("command", command), ("usage", &usage)])
}

pub fn program_usage() -> String {
    spec_program_usage()
}
