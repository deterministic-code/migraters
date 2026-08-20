namespace Deterministic.MigrateRunner;

internal static class Migrations
{
    public static IEnumerable<string> OrderedUpFiles(string migratePath)
    {
        if (!Directory.Exists(migratePath))
            throw new DirectoryNotFoundException(
                HelpTemplates.Message(
                    "errors/migrate-path-not-dir",
                    new Dictionary<string, string> { ["path"] = migratePath }
                )
            );
        return Directory
            .EnumerateFiles(migratePath)
            .Where(p => Path.GetFileName(p).EndsWith("_up.sql", StringComparison.Ordinal))
            .OrderBy(p => Path.GetFileName(p), StringComparer.Ordinal);
    }

    public static async Task<HashSet<string>> AppliedNamesAsync(DbConnection conn, string sql)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        await foreach (var name in ReadColumnAsync(conn, sql).ConfigureAwait(false))
            set.Add(name);
        return set;
    }

    public static Task<string?> LastAppliedAsync(DbConnection conn, string sql) =>
        ReadColumnAsync(conn, sql).FirstOrDefaultAsync();

    public static string? DownPathFor(string migratePath, string upName)
    {
        if (!upName.EndsWith("_up.sql", StringComparison.Ordinal))
            return null;
        var path = Path.Combine(migratePath, $"{upName[..^"_up.sql".Length]}_down.sql");
        return File.Exists(path) ? path : null;
    }

    private static async IAsyncEnumerable<string> ReadColumnAsync(DbConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        using var reader = await cmd.ExecuteReaderAsync().ConfigureAwait(false);
        while (await reader.ReadAsync().ConfigureAwait(false))
            yield return reader.GetString(0);
    }
}

internal static class AsyncEnumerableExtensions
{
    public static async Task<T?> FirstOrDefaultAsync<T>(this IAsyncEnumerable<T> source)
    {
        await foreach (var item in source.ConfigureAwait(false))
            return item;
        return default;
    }
}
