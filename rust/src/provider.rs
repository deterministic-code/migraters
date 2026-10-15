pub fn normalize_provider(raw: &str) -> Option<&'static str> {
    let key: String = raw
        .chars()
        .filter(|c| !matches!(c, ' ' | '_' | '-'))
        .flat_map(|c| c.to_lowercase())
        .collect();
    match key.as_str() {
        "sqlite" | "sqlite3" => Some("sqlite"),
        "mysql" | "mariadb" => Some("mysql"),
        "postgres" | "postgresql" | "pg" => Some("postgres"),
        "sqlserver" | "mssql" | "mssqlserver" => Some("sqlserver"),
        "oracle" | "ora" => Some("oracle"),
        _ => None,
    }
}
