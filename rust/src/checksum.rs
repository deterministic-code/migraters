pub fn checksum_hex(sql: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in sql.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}
