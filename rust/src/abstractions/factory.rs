use crate::provider::normalize_provider;
use migraters_api::registered_dialects;

use super::SqlDialect;

pub fn try_get(name: &str) -> Option<&'static dyn SqlDialect> {
    let key = normalize_provider(name)?;
    registered_dialects()
        .into_iter()
        .find(|dialect| dialect.name() == key)
}

pub fn all() -> Vec<&'static dyn SqlDialect> {
    let mut dialects = registered_dialects();
    dialects.sort_by_key(|dialect| dialect.name());
    dialects
}
