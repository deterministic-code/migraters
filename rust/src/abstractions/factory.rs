use crate::dialects::{MysqlDialect, PostgresDialect, SqliteDialect};

use super::SqlDialect;

pub fn try_get(name: &str) -> Option<&'static dyn SqlDialect> {
    match name {
        "sqlite" => Some(&SqliteDialect),
        "postgres" => Some(&PostgresDialect),
        "mysql" => Some(&MysqlDialect),
        _ => None,
    }
}
