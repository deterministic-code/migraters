#[cfg(feature = "mysql")]
mod mysql;
#[cfg(feature = "oracle")]
mod oracle;
#[cfg(feature = "postgres")]
mod postgres;
#[cfg(feature = "sqlite")]
mod sqlite;
#[cfg(feature = "sqlserver")]
mod sqlserver;

#[cfg(feature = "mysql")]
pub use mysql::MysqlDialect;
#[cfg(feature = "oracle")]
pub use oracle::{parse_oracle_connection, OracleDialect};
#[cfg(feature = "postgres")]
pub use postgres::PostgresDialect;
#[cfg(feature = "sqlite")]
pub use sqlite::SqliteDialect;
#[cfg(feature = "sqlserver")]
pub use sqlserver::SqlServerDialect;

#[cfg(test)]
pub(crate) fn assert_dialect_surface(d: &dyn crate::abstractions::SqlDialect) {
    assert!(!d.name().is_empty());
    assert!(!d.connection_env_vars().is_empty());
    assert!(d.migrates_ddl().to_ascii_lowercase().contains("migrates"));
    assert!(d
        .migrate_logs_ddl()
        .to_ascii_lowercase()
        .contains("migrate_logs"));
    assert!(!d.insert_applied_sql().is_empty());
    assert!(!d.delete_applied_sql().is_empty());
    assert!(!d.quote_ident("t").is_empty());
    assert!(!d.now_expr().is_empty());
    assert!(d.limit_clause(3).contains('3'));
    assert!(d
        .select_applied_checksum_sql()
        .to_ascii_lowercase()
        .contains("migrates"));
}
