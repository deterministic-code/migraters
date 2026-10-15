namespace Deterministic.MigrateRunner;

internal sealed record MigrationFile(string Name, string UpPath);

internal static class Migrations
{
    public static IReadOnlyList<MigrationFile> OrderedUpFiles(string migratePath)
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
            .OrderBy(p => Path.GetFileName(p), StringComparer.Ordinal)
            .Select(p =>
            {
                var file = Path.GetFileName(p);
                return new MigrationFile(file[..^"_up.sql".Length], p);
            })
            .ToList();
    }

    public static string CatalogName(string stored) =>
        stored.EndsWith("_up.sql", StringComparison.Ordinal) ? stored[..^"_up.sql".Length] : stored;

    public static async Task<Dictionary<string, string?>> AppliedChecksumsAsync(
        DbConnection conn,
        string sql
    )
    {
        var map = new Dictionary<string, string?>(StringComparer.Ordinal);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        using var reader = await cmd.ExecuteReaderAsync().ConfigureAwait(false);
        while (await reader.ReadAsync().ConfigureAwait(false))
        {
            var name = CatalogName(reader.GetString(0));
            var checksum = reader.IsDBNull(1) ? null : reader.GetString(1);
            map[name] = checksum;
        }
        return map;
    }

    public static void AssertNoChecksumDrift(
        IReadOnlyList<MigrationFile> files,
        IReadOnlyDictionary<string, string?> applied
    )
    {
        if (Environment.GetEnvironmentVariable("MIGRATE_ALLOW_CHECKSUM_DRIFT") == "1")
            return;
        var lines = new List<string>();
        foreach (var file in files)
        {
            if (!applied.TryGetValue(file.Name, out var stored) || stored is null)
                continue;
            var current = Checksum.Hex(File.ReadAllText(file.UpPath));
            if (current == stored)
                continue;
            lines.Add(
                HelpTemplates
                    .Message(
                        "checksum-drift-line",
                        new Dictionary<string, string>
                        {
                            ["name"] = file.Name,
                            ["stored"] = stored.Length <= 12 ? stored : stored[..12],
                            ["current"] = current.Length <= 12 ? current : current[..12],
                        }
                    )
                    .TrimEnd()
            );
        }
        if (lines.Count == 0)
            return;
        throw new InvalidOperationException(
            HelpTemplates
                .Message("checksum-drift", new Dictionary<string, string> { ["lines"] = string.Join('\n', lines) })
                .TrimEnd()
        );
    }

    public static string? DownPathFor(string migratePath, string name)
    {
        var path = Path.Combine(migratePath, $"{name}_down.sql");
        return File.Exists(path) ? path : null;
    }
}
