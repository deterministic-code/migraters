using Npgsql;

namespace Deterministic.MigrateRunner;

internal static class PostgresCreateDatabase
{
    public static async Task IfMissingAsync(string connection)
    {
        if (ConnectionStringUrl.TryUri(connection, "postgres", "postgresql") is not { } url)
            return;
        var uri = new Uri(url);
        var name = uri.AbsolutePath.Trim('/');
        if (string.IsNullOrEmpty(name) || name == "postgres")
            return;
        var b = new NpgsqlConnectionStringBuilder(PostgresDialect.Instance.NormalizeConnectionString(connection))
        {
            Database = "postgres",
        };
        await using var conn = new NpgsqlConnection(b.ConnectionString);
        await conn.OpenAsync().ConfigureAwait(false);
        try
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = $"CREATE DATABASE \"{name.Replace("\"", "\"\"")}\"";
            await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
        }
        catch (PostgresException ex) when (ex.SqlState == "42P04")
        {
        }
    }
}
