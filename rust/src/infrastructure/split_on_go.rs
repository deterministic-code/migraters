// Whole-line GO separates batches (sqlcmd-style).
pub fn split_on_go(sql: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    for line in sql.replace("\r\n", "\n").split('\n') {
        if line.trim().eq_ignore_ascii_case("GO") {
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
    use super::split_on_go;

    #[test]
    fn splits_on_whole_line_go() {
        assert_eq!(
            split_on_go("CREATE TABLE a (id INT);\nGO\nCREATE TABLE b (id INT)"),
            vec![
                "CREATE TABLE a (id INT);".to_string(),
                "CREATE TABLE b (id INT)".to_string(),
            ]
        );
    }

    #[test]
    fn keeps_semicolons_inside_one_batch() {
        assert_eq!(
            split_on_go("BEGIN\n  SELECT 1;\nEND;"),
            vec!["BEGIN\n  SELECT 1;\nEND;".to_string()]
        );
    }
}
