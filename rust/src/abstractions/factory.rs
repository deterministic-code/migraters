#[cfg(feature = "mysql")]
use crate::dialects::MysqlDialect;
#[cfg(feature = "oracle")]
use crate::dialects::OracleDialect;
#[cfg(feature = "postgres")]
use crate::dialects::PostgresDialect;
#[cfg(feature = "sqlserver")]
use crate::dialects::SqlServerDialect;
#[cfg(feature = "sqlite")]
use crate::dialects::SqliteDialect;
use crate::provider::normalize_provider;

use super::SqlDialect;

pub fn try_get(name: &str) -> Option<&'static dyn SqlDialect> {
    match normalize_provider(name)? {
        #[cfg(feature = "sqlite")]
        "sqlite" => Some(&SqliteDialect),
        #[cfg(feature = "postgres")]
        "postgres" => Some(&PostgresDialect),
        #[cfg(feature = "mysql")]
        "mysql" => Some(&MysqlDialect),
        #[cfg(feature = "sqlserver")]
        "sqlserver" => Some(&SqlServerDialect),
        #[cfg(feature = "oracle")]
        "oracle" => Some(&OracleDialect),
        _ => None,
    }
}

pub fn all() -> &'static [&'static dyn SqlDialect] {
    &[
        #[cfg(feature = "sqlite")]
        &SqliteDialect,
        #[cfg(feature = "postgres")]
        &PostgresDialect,
        #[cfg(feature = "mysql")]
        &MysqlDialect,
        #[cfg(feature = "sqlserver")]
        &SqlServerDialect,
        #[cfg(feature = "oracle")]
        &OracleDialect,
    ]
}
