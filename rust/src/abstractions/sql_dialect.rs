pub trait SqlDialect: Send + Sync {
    fn name(&self) -> &'static str;
    fn connection_env_vars(&self) -> &'static [&'static str];
    fn migrates_ddl(&self) -> &'static str;
    fn migrate_logs_ddl(&self) -> &'static str;
    fn use_transaction(&self) -> bool;
    fn select_applied_sql(&self) -> &'static str;
    fn select_last_applied_sql(&self) -> &'static str;
    fn insert_applied_sql(&self) -> &'static str;
    fn delete_applied_sql(&self) -> &'static str;
    fn normalize_connection(&self, connection: &str) -> String;
    fn prerequisite_error(&self, connection: &str) -> Option<String>;
    fn prepare_setup(&self, connection: &str) -> std::io::Result<()>;

    fn quote_ident(&self, ident: &str) -> String {
        format!("\"{ident}\"")
    }
    fn now_expr(&self) -> &'static str {
        "CURRENT_TIMESTAMP"
    }
    fn limit_clause(&self, n: usize) -> String {
        format!("LIMIT {n}")
    }
    fn uses_last_insert_rowid(&self) -> bool {
        false
    }
    fn select_applied_checksum_sql(&self) -> String {
        let name = self.quote_ident("name");
        let checksum = self.quote_ident("checksum");
        let table = self.quote_ident("migrates");
        format!("SELECT {name} AS name, {checksum} AS checksum FROM {table}")
    }
}
