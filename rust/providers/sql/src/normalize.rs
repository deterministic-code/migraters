pub fn sqlite_is_memory(connection: &str) -> bool {
    let s = connection.trim();
    if s.is_empty() || s == ":memory:" {
        return true;
    }
    let compact: String = s
        .chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(|c| c.to_lowercase())
        .collect();
    compact.contains(":memory:")
        || compact.contains("?mode=memory")
        || compact.contains("&mode=memory")
        || compact.contains(";mode=memory")
}

pub fn sqlite_filesystem_path(connection: &str) -> Option<String> {
    if sqlite_is_memory(connection) {
        return None;
    }
    let mut s = connection.trim().to_string();
    if let Some(eq) = s.find('=') {
        let key = s[..eq].trim().to_ascii_lowercase();
        if key.replace(' ', "") == "datasource" {
            s = s[eq + 1..].trim().to_string();
            if let Some(semi) = s.find(';') {
                s = s[..semi].trim().to_string();
            }
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
    if let Some(q) = s.find('?') {
        s = s[..q].to_string();
    }
    // sqlite:///./app.sqlite keeps the URI slash and would open /./app.sqlite.
    if s.starts_with("/./") {
        s = s[1..].to_string();
    }
    if s == ":memory:" || s.is_empty() {
        return None;
    }
    Some(s)
}

pub fn parse_oracle_connection(connection: &str) -> Result<(String, String, String), String> {
    let Some((user, rest)) = connection.split_once('/') else {
        return Err("Oracle connection must look like user/password@connectString".into());
    };
    let Some((password, connect_string)) = rest.split_once('@') else {
        return Err("Oracle connection must look like user/password@connectString".into());
    };
    if user.is_empty() || password.is_empty() || connect_string.is_empty() {
        return Err("Oracle connection must look like user/password@connectString".into());
    }
    Ok((
        user.to_string(),
        password.to_string(),
        connect_string.to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::sqlite_filesystem_path;

    #[test]
    fn strips_uri_slash_before_relative_dot() {
        assert_eq!(
            sqlite_filesystem_path("sqlite:///./app.sqlite").as_deref(),
            Some("./app.sqlite")
        );
        assert_eq!(
            sqlite_filesystem_path("./app.sqlite").as_deref(),
            Some("./app.sqlite")
        );
        assert_eq!(
            sqlite_filesystem_path("sqlite:///abs/app.sqlite").as_deref(),
            Some("/abs/app.sqlite")
        );
        assert_eq!(
            sqlite_filesystem_path("sqlite:////tmp/app.db").as_deref(),
            Some("//tmp/app.db")
        );
        assert_eq!(sqlite_filesystem_path("sqlite:///:memory:"), None);
    }
}
