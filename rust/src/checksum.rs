use sha2::{Digest, Sha256};

pub fn checksum_hex(sql: &str) -> String {
    let body = strip_legacy_header(sql);
    let digest = Sha256::digest(body.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn strip_legacy_header(sql: &str) -> &str {
    let first = match sql.split_inclusive('\n').next() {
        Some(line) => line,
        None => return sql,
    };
    if !is_legacy_header(first.trim_end_matches(['\r', '\n'])) {
        return sql;
    }
    sql.get(first.len()..).unwrap_or("")
}

fn is_legacy_header(line: &str) -> bool {
    for prefix in ["//", "--", "#"] {
        let Some(rest) = line.strip_prefix(prefix) else {
            continue;
        };
        let rest = rest.trim_start();
        let Some(after) = rest.strip_prefix("deterministic-content-hash:") else {
            continue;
        };
        let hex = after.trim();
        if hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::checksum_hex;

    #[test]
    fn sha256_is_64_hex_chars() {
        let hex = checksum_hex("SELECT 1;");
        assert_eq!(hex.len(), 64);
        assert!(hex.bytes().all(|b| b.is_ascii_hexdigit()));
    }

    #[test]
    fn strips_legacy_header() {
        let body = "CREATE TABLE t (id INT);\n";
        let hash = "a".repeat(64);
        let headed = format!("-- deterministic-content-hash: {hash}\n{body}");
        assert_eq!(checksum_hex(&headed), checksum_hex(body));
    }
}
