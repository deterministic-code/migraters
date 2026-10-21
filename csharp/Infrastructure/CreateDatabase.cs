namespace Deterministic.MigrateRunner;

internal static class CreateDatabase
{
    public static async Task RunAsync(string provider, string connection)
    {
        if (provider is "sqlite" or "oracle")
            return;
        if (provider == "postgres")
        {
            await Postgres(connection).ConfigureAwait(false);
            return;
        }
        if (provider == "mysql")
        {
            await Mysql(connection).ConfigureAwait(false);
            return;
        }
        if (provider == "sqlserver")
            await SqlServer(connection).ConfigureAwait(false);
    }

    private static async Task Postgres(string connection)
    {
        if (ConnectionStringUrl.TryUri(connection, "postgres", "postgresql") is not { } url)
            return;
        var uri = new Uri(url);
        var name = uri.AbsolutePath.Trim('/');
        if (string.IsNullOrEmpty(name) || name == "postgres")
            return;
        var b = new Npgsql.NpgsqlConnectionStringBuilder(PostgresDialect.Instance.NormalizeConnectionString(connection))
        {
            Database = "postgres",
        };
        await using var conn = new Npgsql.NpgsqlConnection(b.ConnectionString);
        await conn.OpenAsync().ConfigureAwait(false);
        try
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = $"CREATE DATABASE \"{name.Replace("\"", "\"\"")}\"";
            await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
        }
        catch (Npgsql.PostgresException ex) when (ex.SqlState == "42P04")
        {
        }
    }

    private static async Task Mysql(string connection)
    {
        var normalized = MysqlDialect.Instance.NormalizeConnectionString(connection);
        var b = new MySqlConnector.MySqlConnectionStringBuilder(normalized);
        if (string.IsNullOrEmpty(b.Database))
            return;
        var name = b.Database;
        b.Database = "";
        await using var conn = new MySqlConnector.MySqlConnection(b.ConnectionString);
        await conn.OpenAsync().ConfigureAwait(false);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"CREATE DATABASE IF NOT EXISTS `{name.Replace("`", "``")}`";
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
    }

    private static async Task SqlServer(string connection)
    {
        var b = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(connection);
        if (string.IsNullOrEmpty(b.InitialCatalog) || b.InitialCatalog.Equals("master", StringComparison.OrdinalIgnoreCase))
            return;
        var name = b.InitialCatalog;
        b.InitialCatalog = "master";
        await using var conn = new Microsoft.Data.SqlClient.SqlConnection(b.ConnectionString);
        await conn.OpenAsync().ConfigureAwait(false);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            $"IF DB_ID(N'{name.Replace("'", "''")}') IS NULL CREATE DATABASE [{name.Replace("]", "]]")}]";
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
    }
}
