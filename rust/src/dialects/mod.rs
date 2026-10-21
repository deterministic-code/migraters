#[allow(dead_code)]
pub(crate) fn assert_dialect_surface(d: &dyn crate::abstractions::SqlDialect) {
    migraters_api::assert_dialect_surface(d);
}
