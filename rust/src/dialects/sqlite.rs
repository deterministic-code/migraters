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

#[cfg(test)]
mod api_tests {
    use super::SqliteDialect;
    use crate::abstractions::SqlDialect;
    use crate::checksum::checksum_hex;
    use crate::infrastructure::MigrationPool;

    #[tokio::test]
    async fn setup_apply_applied_rollback() {
        use crate::migrater::{DownArg, IMigrater, Migrater, SetupArg, UpArg};
        let dialect: &dyn SqlDialect = &SqliteDialect;
        let dir = std::env::temp_dir().join(format!(
            "migraters-api-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("app.sqlite");
        let connection = db.to_str().unwrap();
        let migrations_path = dir.join("migrations");
        let migrater = Migrater::new(dialect);
        migrater
            .setup(SetupArg {
                connection,
                migrations_path: migrations_path.to_str().unwrap(),
            })
            .await
            .unwrap();
        let sql = "CREATE TABLE t (id INTEGER);\n";
        std::fs::write(migrations_path.join("0001_init_up.sql"), sql).unwrap();
        std::fs::write(
            migrations_path.join("0001_init_down.sql"),
            "DROP TABLE t;\n",
        )
        .unwrap();
        let names = migrater
            .up(UpArg {
                connection,
                migrations_path: migrations_path.to_str().unwrap(),
                one: false,
            })
            .await
            .unwrap();
        assert_eq!(names, vec!["0001_init".to_string()]);
        let pool = MigrationPool::connect(dialect, connection).await.unwrap();
        let applied = pool
            .fetch_applied(&dialect.select_applied_checksum_sql())
            .await
            .unwrap();
        assert_eq!(
            applied.get("0001_init").cloned().flatten().as_deref(),
            Some(checksum_hex(sql).as_str())
        );
        let rolled = migrater
            .down(DownArg {
                connection,
                migrations_path: migrations_path.to_str().unwrap(),
            })
            .await
            .unwrap();
        assert_eq!(rolled.as_deref(), Some("0001_init"));
        let applied = pool
            .fetch_applied(&dialect.select_applied_checksum_sql())
            .await
            .unwrap();
        assert!(!applied.contains_key("0001_init"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
