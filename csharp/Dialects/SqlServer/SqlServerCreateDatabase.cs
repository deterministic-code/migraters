using Microsoft.Data.SqlClient;

namespace Deterministic.MigrateRunner;

internal static class SqlServerCreateDatabase
{
    public static async Task IfMissingAsync(string connection)
    {
        var b = new SqlConnectionStringBuilder(connection);
        if (string.IsNullOrEmpty(b.InitialCatalog) || b.InitialCatalog.Equals("master", StringComparison.OrdinalIgnoreCase))
            return;
        var name = b.InitialCatalog;
        b.InitialCatalog = "master";
        await using var conn = new SqlConnection(b.ConnectionString);
        await conn.OpenAsync().ConfigureAwait(false);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            $"IF DB_ID(N'{name.Replace("'", "''")}') IS NULL CREATE DATABASE [{name.Replace("]", "]]")}]";
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
    }
}
