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
