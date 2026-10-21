use crate::abstractions::try_get;

pub async fn create_database(
    provider: &str,
    connection: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let Some(dialect) = try_get(provider) else {
        return Ok(());
    };
    dialect
        .create_database(connection)
        .await
        .map_err(|err| err.to_string())?;
    Ok(())
}
