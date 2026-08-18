// Block-aware: BEGIN/END (case-insensitive) inside a CREATE TRIGGER body is tracked so the inner UPDATE's `;` does not terminate the outer statement (sqlite error code 1 "incomplete input" otherwise).
// A whole-line `GO` is a batch separator (mysql/sqlserver stored-procedure DDL): it flushes the current statement and is dropped, so `DROP …; GO CREATE PROCEDURE … END; GO` splits into clean per-procedure batches.
pub fn split_statements(sql: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut in_dollar_tag: Option<String> = None;
    let mut block_depth: i32 = 0;
    let mut word = String::new();
    let chars: Vec<char> = sql.chars().collect();
    let mut i = 0usize;
    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if in_dollar_tag.is_none()
            && !in_line_comment
            && !in_block_comment
            && !in_single_quote
            && !in_double_quote
            && (i == 0 || chars[i - 1] == '\n')
        {
            let mut j = i;
            while j < chars.len() && chars[j] != '\n' {
                j += 1;
            }
            if chars[i..j]
                .iter()
                .collect::<String>()
                .trim()
                .eq_ignore_ascii_case("GO")
            {
                let s = buf.trim().to_string();
                if !s.is_empty() {
                    out.push(s);
                }
                buf.clear();
                block_depth = 0;
                word.clear();
                i = if j < chars.len() { j + 1 } else { j };
                continue;
            }
        }
        if !in_line_comment
            && !in_block_comment
            && in_dollar_tag.is_none()
            && !in_single_quote
            && !in_double_quote
        {
            if c == '-' && next == Some('-') {
                in_line_comment = true;
                buf.push(c);
                i += 1;
                continue;
            }
            if c == '/' && next == Some('*') {
                in_block_comment = true;
                buf.push(c);
                i += 1;
                continue;
            }
            if c == '$' {
                let mut j = i + 1;
                while j < chars.len() && chars[j] != '$' {
                    j += 1;
                }
                if j < chars.len() {
                    let tag: String = chars[i..=j].iter().collect();
                    in_dollar_tag = Some(tag);
                    for k in i..=j {
                        buf.push(chars[k]);
                    }
                    i = j + 1;
                    continue;
                }
            }
        }
        if in_line_comment {
            buf.push(c);
            if c == '\n' {
                in_line_comment = false;
            }
            i += 1;
            continue;
        }
        if in_block_comment {
            buf.push(c);
            if c == '*' && next == Some('/') {
                buf.push('/');
                in_block_comment = false;
                i += 2;
                continue;
            }
            i += 1;
            continue;
        }
        if let Some(tag) = &in_dollar_tag {
            buf.push(c);
            if c == '$' {
                let end = i + tag.len();
                if end <= chars.len() {
                    let candidate: String = chars[i..end].iter().collect();
                    if &candidate == tag {
                        for k in (i + 1)..end {
                            buf.push(chars[k]);
                        }
                        in_dollar_tag = None;
                        i = end;
                        continue;
                    }
                }
            }
            i += 1;
            continue;
        }
        if in_single_quote {
            buf.push(c);
            if c == '\'' {
                in_single_quote = false;
            }
            i += 1;
            continue;
        }
        if in_double_quote {
            buf.push(c);
            if c == '"' {
                in_double_quote = false;
            }
            i += 1;
            continue;
        }
        if c == '\'' {
            in_single_quote = true;
            buf.push(c);
            i += 1;
            continue;
        }
        if c == '"' {
            in_double_quote = true;
            buf.push(c);
            i += 1;
            continue;
        }
        if c.is_alphabetic() || c == '_' {
            word.push(c);
            buf.push(c);
            i += 1;
            continue;
        }
        if !word.is_empty() {
            let upper = word.to_ascii_uppercase();
            if upper == "BEGIN" {
                block_depth += 1;
            } else if upper == "END" && block_depth > 0 {
                block_depth -= 1;
            }
            word.clear();
        }
        if c == ';' && block_depth == 0 {
            buf.push(c);
            let s = buf.trim().to_string();
            if !s.is_empty() {
                out.push(s);
            }
            buf.clear();
            i += 1;
            continue;
        }
        buf.push(c);
        i += 1;
    }
    let tail = buf.trim().to_string();
    if !tail.is_empty() {
        out.push(tail);
    }
    out
}
