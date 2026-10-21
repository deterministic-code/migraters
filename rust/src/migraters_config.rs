use std::env;
use std::fs;
use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = ".migraters.yaml";

pub fn enabled_dialects() -> Vec<String> {
    match find_path(&env::current_dir().unwrap_or_else(|_| PathBuf::from("."))) {
        Some(path) => match fs::read_to_string(path) {
            Ok(raw) => parse_dialects(&raw),
            Err(_) => Vec::new(),
        },
        None => Vec::new(),
    }
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

pub fn parse_dialects(raw: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut in_dialects = false;
    for line in raw.lines() {
        if !in_dialects {
            if line.trim() == "dialects:" {
                in_dialects = true;
            }
            continue;
        }
        let item = line.trim();
        if let Some(name) = item.strip_prefix("- ") {
            let name = name.trim();
            if !name.is_empty() {
                names.push(name.to_string());
            }
            continue;
        }
        if item.is_empty() {
            continue;
        }
        break;
    }
    names
}

#[cfg(test)]
mod tests {
    use super::parse_dialects;

    #[test]
    fn reads_block_list() {
        let names = parse_dialects(
            "language: rust\ndialects:\n  - sqlite\n  - postgres\nbinDir: rust/target/debug\n",
        );
        assert_eq!(names, ["sqlite", "postgres"]);
        assert!(
            parse_dialects("language: rust\ndialects: []\nbinDir: rust/target/debug\n").is_empty()
        );
    }
}
