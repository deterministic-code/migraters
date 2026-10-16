pub fn strip_key(raw: &str) -> String {
    raw.chars()
        .filter(|c| !matches!(c, ' ' | '_' | '-'))
        .flat_map(|c| c.to_lowercase())
        .collect()
}

pub fn normalize_provider(raw: &str) -> Option<&'static str> {
    let key = strip_key(raw);
    if let Some(name) = crate::cli_spec::providers()
        .iter()
        .find(|p| strip_key(p) == key)
    {
        return Some(name.as_str());
    }
    crate::cli_spec::provider_aliases()
        .get(&key)
        .map(|s| s.as_str())
}

#[cfg(test)]
mod tests {
    use super::normalize_provider;
    use crate::abstractions::all;
    use crate::cli_spec;

    #[test]
    fn registry_matches_cli_yaml() {
        let names: Vec<&str> = all().iter().map(|d| d.name()).collect();
        let expected: Vec<&str> = cli_spec::providers().iter().map(|s| s.as_str()).collect();
        assert_eq!(names, expected);
        for (alias, canonical) in cli_spec::provider_aliases() {
            assert_eq!(
                normalize_provider(alias),
                Some(canonical.as_str()),
                "{alias}"
            );
        }
        assert_eq!(normalize_provider("MS-SQL-Server"), Some("sqlserver"));
        assert_eq!(normalize_provider("nope"), None);
        for dialect in all() {
            assert_eq!(
                dialect
                    .connection_env_vars()
                    .join(cli_spec::env_var_list_separator()),
                crate::cli_spec::join_env_vars(dialect.connection_env_vars())
            );
        }
    }
}
