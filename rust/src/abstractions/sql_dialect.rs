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
}
