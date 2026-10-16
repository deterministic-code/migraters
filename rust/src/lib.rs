pub mod abstractions;
pub mod argv;
pub mod checksum;
pub mod cli_spec;
pub mod dialects;
pub mod help;
pub mod infrastructure;
pub mod messages;
pub mod migrater;
pub mod migrations;
pub mod provider;

pub use abstractions::{all, try_get, SqlDialect};
pub use argv::{is_help, take_value};
pub use checksum::checksum_hex;
pub use cli_spec::join_env_vars;
#[cfg(feature = "oracle")]
pub use dialects::parse_oracle_connection;
pub use help::{fill_help_template, program_usage};
pub use infrastructure::{connection_from_env, MigrationPool};
pub use messages::{fill_template, message, scaffold, SUPPORTED_PROVIDERS};
pub use migrater::{
    get_migrater, CreateArg, CreateResponse, DownArg, IMigrater, Migrater, SetupArg, UpArg,
};
pub use migrations::{
    assert_no_checksum_drift, catalog_name, discover_up_files, down_path_for, is_migration_name,
    next_sequence,
};

#[cfg(test)]
mod api_yaml {
    const RAW: &str = include_str!("../../api.yaml");

    #[test]
    fn lists_imigrater() {
        assert!(RAW.contains("interface: IMigrater"));
        for method in ["setup", "up", "down", "create"] {
            assert!(
                RAW.contains(&format!("  - {method}")),
                "api.yaml missing method {method}"
            );
        }
    }
}
