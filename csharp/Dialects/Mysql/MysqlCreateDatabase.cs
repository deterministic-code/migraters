using MySqlConnector;

namespace Deterministic.MigrateRunner;

internal static class MysqlCreateDatabase
{
    public static async Task IfMissingAsync(string connection)
    {
        var normalized = MysqlDialect.NormalizeConnection(connection);
        var b = new MySqlConnectionStringBuilder(normalized);
        if (string.IsNullOrEmpty(b.Database))
            return;
        var name = b.Database;
        b.Database = "";
        await using var conn = new MySqlConnection(b.ConnectionString);
        await conn.OpenAsync().ConfigureAwait(false);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"CREATE DATABASE IF NOT EXISTS `{name.Replace("`", "``")}`";
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
    }
}
