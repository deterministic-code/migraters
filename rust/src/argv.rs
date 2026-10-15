pub fn take_value(
    arg: &str,
    iter: &mut impl Iterator<Item = String>,
    flag: &str,
) -> Option<String> {
    if arg == flag {
        return iter.next();
    }
    let prefix = format!("{flag}=");
    arg.strip_prefix(&prefix).map(str::to_string)
}

pub fn is_help(arg: &str) -> bool {
    arg == "-h" || arg == "--help"
}
