use crate::migraters_config;
use crate::provider::normalize_provider;
use migraters_api::registered_dialects;

use super::Dialect;

fn enabled() -> Vec<&'static dyn Dialect> {
    let registered = registered_dialects();
    migraters_config::enabled_providers()
        .into_iter()
        .map(|entry| {
            let name = normalize_provider(&entry.name).unwrap_or(entry.name.as_str());
            registered
                .iter()
                .copied()
                .find(|dialect| dialect.name() == name)
                .unwrap_or_else(|| panic!("{name}"))
        })
        .collect()
}

pub fn try_get(name: &str) -> Option<&'static dyn Dialect> {
    let key = normalize_provider(name)?;
    enabled()
        .into_iter()
        .find(|dialect| dialect.name() == key)
}

pub fn all() -> Vec<&'static dyn Dialect> {
    let mut dialects = enabled();
    dialects.sort_by_key(|dialect| dialect.name());
    dialects
}
