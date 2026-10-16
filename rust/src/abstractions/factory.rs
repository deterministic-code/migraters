use crate::dialects::{
    MysqlDialect, OracleDialect, PostgresDialect, SqlServerDialect, SqliteDialect,
};
use crate::provider::normalize_provider;

use super::SqlDialect;

pub fn try_get(name: &str) -> Option<&'static dyn SqlDialect> {
    match normalize_provider(name)? {
        "sqlite" => Some(&SqliteDialect),
        "postgres" => Some(&PostgresDialect),
        "mysql" => Some(&MysqlDialect),
        "sqlserver" => Some(&SqlServerDialect),
        "oracle" => Some(&OracleDialect),
        _ => None,
    }
}

pub fn all() -> &'static [&'static dyn SqlDialect] {
    &[
        &SqliteDialect,
        &PostgresDialect,
        &MysqlDialect,
        &SqlServerDialect,
        &OracleDialect,
    ]
}
