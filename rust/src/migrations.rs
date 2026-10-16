use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::checksum::checksum_hex;
use crate::messages::message;

pub fn catalog_name(stored: &str) -> &str {
    stored.strip_suffix("_up.sql").unwrap_or(stored)
}

pub fn is_migration_name(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_lowercase() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

pub fn parse_sequence(filename: &str) -> Option<u32> {
    if !filename.ends_with("_up.sql") {
        return None;
    }
    let bytes = filename.as_bytes();
    let mut end = 0usize;
    while end < bytes.len() && end < 4 && bytes[end].is_ascii_digit() {
        end += 1;
    }
    if end == 0 {
        return None;
    }
    if end >= bytes.len() || bytes[end] != b'_' {
        return None;
    }
    if end == 4 && bytes.len() > 4 && bytes[4].is_ascii_digit() {
        return None;
    }
    filename[..end].parse::<u32>().ok()
}

pub fn next_sequence<I, S>(filenames: I) -> u32
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut max = 0u32;
    for name in filenames {
        if let Some(n) = parse_sequence(name.as_ref()) {
            if n > max {
                max = n;
            }
        }
    }
    max + 1
}

pub fn discover_up_files(
    migrate_path: &str,
) -> Result<Vec<(String, PathBuf)>, Box<dyn std::error::Error>> {
    let dir = PathBuf::from(migrate_path);
    if !dir.is_dir() {
        return Err(message("errors/migrate-path-not-dir", &[("path", migrate_path)]).into());
    }
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = match path.file_name().and_then(|s| s.to_str()) {
            Some(n) if n.ends_with("_up.sql") => n.to_string(),
            _ => continue,
        };
        let name = file_name[..file_name.len() - "_up.sql".len()].to_string();
        out.push((name, path));
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

pub fn down_path_for(migrate_path: &str, name: &str) -> Option<PathBuf> {
    let path = PathBuf::from(migrate_path).join(format!("{name}_down.sql"));
    path.is_file().then_some(path)
}

pub fn assert_no_checksum_drift(
    files: &[(String, PathBuf)],
    applied: &HashMap<String, Option<String>>,
) -> Result<(), String> {
    if std::env::var("MIGRATE_ALLOW_CHECKSUM_DRIFT")
        .ok()
        .as_deref()
        == Some("1")
    {
        return Ok(());
    }
    let mut lines = Vec::new();
    for (name, path) in files {
        let Some(Some(stored)) = applied.get(name).cloned() else {
            continue;
        };
        let sql = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let current = checksum_hex(&sql);
        if current != stored {
            let line = message(
                "checksum-drift-line",
                &[
                    ("name", name),
                    ("stored", &stored.chars().take(12).collect::<String>()),
                    ("current", &current.chars().take(12).collect::<String>()),
                ],
            );
            lines.push(line.trim_end().to_string());
        }
    }
    if lines.is_empty() {
        return Ok(());
    }
    Err(message("checksum-drift", &[("lines", &lines.join("\n"))])
        .trim_end()
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::{discover_up_files, is_migration_name, next_sequence};

    #[test]
    fn create_name_and_sequence() {
        assert!(is_migration_name("add_users"));
        assert!(!is_migration_name("AddUsers"));
        assert!(!is_migration_name("1bad"));
        assert_eq!(next_sequence([] as [&str; 0]), 1);
        assert_eq!(next_sequence(["0001_init_up.sql"]), 2);
        assert_eq!(
            next_sequence(["20240101120000_legacy_up.sql", "0003_later_up.sql"]),
            4
        );
    }

    #[test]
    fn missing_migrations_directory_is_the_shared_error() {
        let err = discover_up_files("/nope/migraters-missing-dir")
            .err()
            .unwrap()
            .to_string();
        assert!(err.contains("migrate-path is not a directory"));
    }
}
