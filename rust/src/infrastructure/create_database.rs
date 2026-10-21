pub async fn create_database(provider: &str, connection: &str) -> Result<(), Box<dyn std::error::Error>> {
    match provider {
        "postgres" => postgres(connection).await,
        "mysql" => mysql(connection).await,
        "sqlserver" => sqlserver(connection).await,
        _ => Ok(()),
    }
}

fn database_name_from_url(connection: &str) -> Option<&str> {
    let (_, tail) = connection.rsplit_once('/')?;
    let name = tail.split(['?', '#']).next()?;
    if name.is_empty() {
        return None;
    }
    Some(name)
}

fn admin_url(connection: &str, admin_db: &str) -> Option<String> {
    let (head, tail) = connection.rsplit_once('/')?;
    let rest = tail.find(['?', '#']).map(|i| &tail[i..]).unwrap_or("");
    Some(format!("{head}/{admin_db}{rest}"))
}

#[cfg(feature = "postgres")]
async fn postgres(connection: &str) -> Result<(), Box<dyn std::error::Error>> {
    let Some(name) = database_name_from_url(connection) else {
        return Ok(());
    };
    if name == "postgres" {
        return Ok(());
    }
    let Some(admin) = admin_url(connection, "postgres") else {
        return Ok(());
    };
    let pool = sqlx::PgPool::connect(&admin).await?;
    let sql = format!("CREATE DATABASE \"{}\"", name.replace('"', "\"\""));
    match sqlx::query(&sql).execute(&pool).await {
        Ok(_) => Ok(()),
        Err(e) if e.to_string().contains("already exists") => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[cfg(not(feature = "postgres"))]
async fn postgres(_: &str) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(feature = "mysql")]
async fn mysql(connection: &str) -> Result<(), Box<dyn std::error::Error>> {
    let Some(name) = database_name_from_url(connection) else {
        return Ok(());
    };
    let Some(admin) = admin_url(connection, "") else {
        return Ok(());
    };
    let pool = sqlx::MySqlPool::connect(&admin).await?;
    let sql = format!("CREATE DATABASE IF NOT EXISTS `{name}`");
    sqlx::query(&sql).execute(&pool).await?;
    Ok(())
}

#[cfg(not(feature = "mysql"))]
async fn mysql(_: &str) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(feature = "sqlserver")]
async fn sqlserver(connection: &str) -> Result<(), Box<dyn std::error::Error>> {
    let Some(name) = connection.split(';').find_map(|part| {
        let (k, v) = part.split_once('=')?;
        k.eq_ignore_ascii_case("Database").then_some(v)
    }) else {
        return Ok(());
    };
    if name.eq_ignore_ascii_case("master") {
        return Ok(());
    }
    let admin = connection.replace(&format!("Database={name}"), "Database=master");
    let config = tiberius::Config::from_ado_string(&admin)
        .or_else(|_| tiberius::Config::from_jdbc_string(&admin))?;
    let tcp = tokio::net::TcpStream::connect(config.get_addr()).await?;
    tcp.set_nodelay(true)?;
    use tokio_util::compat::TokioAsyncWriteCompatExt;
    let mut client = tiberius::Client::connect(config, tcp.compat_write()).await?;
    let sql = format!(
        "IF DB_ID(N'{}') IS NULL CREATE DATABASE [{}]",
        name.replace('\'', "''"),
        name
    );
    client.simple_query(sql).await?;
    Ok(())
}

#[cfg(not(feature = "sqlserver"))]
async fn sqlserver(_: &str) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}
