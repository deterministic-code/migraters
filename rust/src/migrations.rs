use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::checksum::checksum_hex;
use crate::messages::message;

pub fn catalog_name(stored: &str) -> &str {
    stored.strip_suffix("_up.sql").unwrap_or(stored)
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
