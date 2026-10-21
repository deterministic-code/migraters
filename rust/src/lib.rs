mod attached_dialects;
pub mod abstractions;
pub mod argv;
pub mod checksum;
pub mod cli_spec;
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
pub use help::fill_help_template;
pub use infrastructure::{connection_from_env, create_database, MigrationPool};
pub use messages::{fill_template, message, scaffold};
pub use migrater::{CreateArg, CreateResponse, DownArg, IMigrater, Migrater, SetupArg, UpArg};
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

#[cfg(test)]
mod sqlite_lifecycle {
    use crate::checksum::checksum_hex;
    use crate::infrastructure::MigrationPool;
    use crate::migrater::{DownArg, IMigrater, Migrater, SetupArg, UpArg};
    use crate::try_get;

    #[tokio::test]
    async fn setup_apply_applied_rollback() {
        let Some(dialect) = try_get("sqlite") else {
            return;
        };
        let dir = std::env::temp_dir().join(format!(
            "migraters-api-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let connection = format!(
            "sqlite://file:migraters-api-{}-{}?mode=memory&cache=shared",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let connection = connection.as_str();
        let _keep = dialect.connect(connection).await.unwrap();
        let migrations_path = dir.join("migrations");
        let migrater = Migrater::new(dialect);
        migrater
            .setup(SetupArg {
                connection,
                migrations_path: migrations_path.to_str().unwrap(),
            })
            .await
            .unwrap();
        let sql = "CREATE TABLE t (id INTEGER);\n";
        std::fs::write(migrations_path.join("0001_init_up.sql"), sql).unwrap();
        std::fs::write(
            migrations_path.join("0001_init_down.sql"),
            "DROP TABLE t;\n",
        )
        .unwrap();
        let names = migrater
            .up(UpArg {
                connection,
                migrations_path: migrations_path.to_str().unwrap(),
                one: false,
            })
            .await
            .unwrap();
        assert_eq!(names, vec!["0001_init".to_string()]);
        let pool = MigrationPool::connect(dialect, connection).await.unwrap();
        let applied = pool
            .fetch_applied(&dialect.select_applied_checksum_sql())
            .await
            .unwrap();
        assert_eq!(
            applied.get("0001_init").cloned().flatten().as_deref(),
            Some(checksum_hex(sql).as_str())
        );
        let rolled = migrater
            .down(DownArg {
                connection,
                migrations_path: migrations_path.to_str().unwrap(),
            })
            .await
            .unwrap();
        assert_eq!(rolled.as_deref(), Some("0001_init"));
        let applied = pool
            .fetch_applied(&dialect.select_applied_checksum_sql())
            .await
            .unwrap();
        assert!(!applied.contains_key("0001_init"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
