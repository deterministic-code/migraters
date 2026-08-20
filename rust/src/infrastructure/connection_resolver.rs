use crate::abstractions::SqlDialect;

pub fn connection_from_env(dialect: &dyn SqlDialect) -> Option<String> {
    dialect
        .connection_env_vars()
        .iter()
        .find_map(|name| std::env::var(name).ok().filter(|v| !v.is_empty()))
}
