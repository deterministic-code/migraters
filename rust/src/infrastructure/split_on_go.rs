// Batch-separator lines start with the delimiter (sqlcmd-style GO by default).
fn is_iso_date(token: &str) -> bool {
    let b = token.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b[0..4].iter().all(u8::is_ascii_digit)
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[8..10].iter().all(u8::is_ascii_digit)
}

pub fn is_batch_separator_line(line: &str, separator: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return false;
    }
    let mut tokens = trimmed.split_whitespace();
    let Some(first) = tokens.next() else {
        return false;
    };
    if !first.eq_ignore_ascii_case(separator) {
        return false;
    }
    match tokens.next() {
        None => true,
        Some(second) if second.starts_with("--") => true,
        Some(second) if is_iso_date(second) => match tokens.next() {
            None => true,
            Some(third) if third.starts_with("--") => true,
            _ => false,
        },
        _ => false,
    }
}

pub fn split_on_go(sql: &str) -> Vec<String> {
    split_on_separator(sql, "GO")
}

pub fn split_on_separator(sql: &str, separator: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    for line in sql.replace("\r\n", "\n").split('\n') {
        if is_batch_separator_line(line, separator) {
            let s = buf.trim();
            if !s.is_empty() {
                out.push(s.to_string());
            }
            buf.clear();
            continue;
        }
        if !buf.is_empty() {
            buf.push('\n');
        }
        buf.push_str(line);
    }
    let tail = buf.trim();
    if !tail.is_empty() {
        out.push(tail.to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::split_on_separator;

    #[test]
    fn splits_on_whole_line_go() {
        assert_eq!(
            split_on_separator(
                "CREATE TABLE a (id INT);\nGO\nCREATE TABLE b (id INT)",
                "GO"
            ),
            vec![
                "CREATE TABLE a (id INT);".to_string(),
                "CREATE TABLE b (id INT)".to_string(),
            ]
        );
    }

    #[test]
    fn keeps_semicolons_inside_one_batch() {
        assert_eq!(
            split_on_separator("BEGIN\n  SELECT 1;\nEND;", "GO"),
            vec!["BEGIN\n  SELECT 1;\nEND;".to_string()]
        );
    }

    #[test]
    fn splits_on_custom_token() {
        assert_eq!(
            split_on_separator("SELECT 1;\n;;\nSELECT 2;", ";;"),
            vec!["SELECT 1;".to_string(), "SELECT 2;".to_string()]
        );
    }

    #[test]
    fn accepts_trailing_comment_and_date() {
        assert_eq!(
            split_on_separator(
                "SELECT 1;\nGO -- rebuild\nSELECT 2;\nGO 2026-10-29 -- note\nSELECT 3;",
                "GO"
            ),
            vec![
                "SELECT 1;".to_string(),
                "SELECT 2;".to_string(),
                "SELECT 3;".to_string(),
            ]
        );
    }

    #[test]
    fn ignores_prefix_match() {
        assert_eq!(
            split_on_separator("SELECT GOING;\nGOING\nSELECT 2;", "GO"),
            vec!["SELECT GOING;\nGOING\nSELECT 2;".to_string()]
        );
    }
}
