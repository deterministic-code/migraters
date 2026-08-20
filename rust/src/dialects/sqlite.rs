use crate::abstractions::SqlDialect;
use crate::messages::message;

pub struct SqliteDialect;

impl SqlDialect for SqliteDialect {
    fn name(&self) -> &'static str {
        "sqlite"
    }
    fn connection_env_vars(&self) -> &'static [&'static str] {
        &["SQLITE_PATH", "DB_PATH"]
    }
    fn migrates_ddl(&self) -> &'static str {
        include_str!("../../../shared/templates/sql/sqlite/migrates.sql")
    }
    fn migrate_logs_ddl(&self) -> &'static str {
        include_str!("../../../shared/templates/sql/sqlite/migrate_logs.sql")
    }
    fn use_transaction(&self) -> bool {
        true
    }
    fn select_applied_sql(&self) -> &'static str {
        r#"SELECT "name" FROM "migrates""#
    }
    fn select_last_applied_sql(&self) -> &'static str {
        r#"SELECT "name" FROM "migrates" ORDER BY "name" DESC LIMIT 1"#
    }
    fn insert_applied_sql(&self) -> &'static str {
        r#"INSERT INTO "migrates" ("name", "checksum") VALUES (?, ?)"#
    }
    fn delete_applied_sql(&self) -> &'static str {
        r#"DELETE FROM "migrates" WHERE "name" = ?"#
    }
    fn normalize_connection(&self, connection: &str) -> String {
        if connection.starts_with("sqlite:") {
            connection.to_string()
        } else {
            format!("sqlite://{}?mode=rwc", connection)
        }
    }
    fn prerequisite_error(&self, connection: &str) -> Option<String> {
        let path = filesystem_path(connection)?;
        if std::path::Path::new(&path).exists() {
            return None;
        }
        Some(message("errors/sqlite-prerequisite", &[("path", &path)]))
    }
    fn prepare_setup(&self, connection: &str) -> std::io::Result<()> {
        if let Some(path) = filesystem_path(connection) {
            if let Some(parent) = std::path::Path::new(&path).parent() {
                if !parent.as_os_str().is_empty() {
                    std::fs::create_dir_all(parent)?;
                }
            }
        }
        Ok(())
    }
}

fn filesystem_path(connection: &str) -> Option<String> {
    let mut s = connection.trim().to_string();
    if let Some(eq) = s.find('=') {
        let key = s[..eq].trim().to_ascii_lowercase();
        if key.replace(' ', "") == "datasource" {
            s = s[eq + 1..].trim().to_string();
        }
    }
    let lower = s.to_ascii_lowercase();
    if lower.starts_with("sqlite://") {
        s = s["sqlite://".len()..].to_string();
    } else if lower.starts_with("sqlite:") {
        s = s["sqlite:".len()..].to_string();
    } else if lower.starts_with("file:") {
        s = s["file:".len()..].to_string();
    }
    if s == ":memory:" || s.is_empty() {
        return None;
    }
    Some(s)
}
