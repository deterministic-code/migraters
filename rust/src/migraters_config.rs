use std::env;
use std::fs;
use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = ".migraters.yaml";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderEntry {
    pub name: String,
}

pub fn enabled_providers() -> Vec<ProviderEntry> {
    match find_path(&env::current_dir().unwrap_or_else(|_| PathBuf::from("."))) {
        Some(path) => match fs::read_to_string(path) {
            Ok(raw) => parse_providers(&raw),
            Err(_) => Vec::new(),
        },
        None => Vec::new(),
    }
}

pub fn enabled_dialects() -> Vec<String> {
    enabled_providers().into_iter().map(|p| p.name).collect()
}

pub fn find_path(start: &Path) -> Option<PathBuf> {
    let mut dir = start.to_path_buf();
    loop {
        let candidate = dir.join(FILE_NAME);
        if candidate.is_file() {
            return Some(candidate);
        }
        if !dir.pop() {
            return None;
        }
    }
}

pub fn parse_providers(raw: &str) -> Vec<ProviderEntry> {
    let mut entries = Vec::new();
    let mut in_providers = false;
    let mut name: Option<String> = None;
    let mut take = |name: &mut Option<String>| {
        if let Some(n) = name.take() {
            if !n.is_empty() {
                entries.push(ProviderEntry { name: n });
            }
        }
    };
    for line in raw.lines() {
        if !in_providers {
            if line.trim() == "providers:" {
                in_providers = true;
            }
            continue;
        }
        let item = line.trim();
        if let Some(rest) = item.strip_prefix("- name:") {
            take(&mut name);
            name = Some(rest.trim().to_string());
            continue;
        }
        if item.starts_with("location:") {
            continue;
        }
        if item.is_empty() || item.starts_with("- ") {
            continue;
        }
        break;
    }
    take(&mut name);
    entries
}

#[cfg(test)]
mod tests {
    use super::parse_providers;

    #[test]
    fn reads_block_list() {
        let names = parse_providers(
            "language: rust\nproviders:\n  - name: sqlite\n    location: providers/sqlite\n  - name: postgres\nbinDir: rust/target/debug\n",
        );
        assert_eq!(
            names.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(),
            ["sqlite", "postgres"]
        );
        assert!(
            parse_providers("language: rust\nproviders: []\nbinDir: rust/target/debug\n")
                .is_empty()
        );
    }
}
