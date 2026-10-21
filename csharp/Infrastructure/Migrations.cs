namespace Deterministic.MigrateRunner;

internal sealed record MigrationFile(string Name, string UpPath);

internal static class Migrations
{
    private static readonly Regex NameRe = new("^[a-z][a-z0-9_]*$", RegexOptions.Compiled);
    private static readonly Regex SeqRe = new(@"^(\d{1,4})_.*_up\.sql$", RegexOptions.Compiled);

    public static bool IsMigrationName(string name) => NameRe.IsMatch(name);

    public static int NextSequence(IEnumerable<string> fileNames) =>
        fileNames
            .Select(f => SeqRe.Match(f))
            .Where(m => m.Success)
            .Select(m => int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture))
            .DefaultIfEmpty(0)
            .Max() + 1;

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
