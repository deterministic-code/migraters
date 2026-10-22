use std::sync::OnceLock;

use crate::migraters_config;
use crate::provider::normalize_provider;
use migraters_api::registered_dialects;

use super::Dialect;

fn enabled() -> &'static [&'static dyn Dialect] {
    static ENABLED: OnceLock<Vec<&'static dyn Dialect>> = OnceLock::new();
    ENABLED
        .get_or_init(|| {
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
        })
        .as_slice()
}

pub fn try_get(name: &str) -> Option<&'static dyn Dialect> {
    let key = normalize_provider(name)?;
    enabled()
        .iter()
        .copied()
        .find(|dialect| dialect.name() == key)
}

pub fn all() -> Vec<&'static dyn Dialect> {
    let mut dialects = enabled().to_vec();
    dialects.sort_by_key(|dialect| dialect.name());
    dialects
}
