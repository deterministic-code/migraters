namespace Deterministic.MigrateRunner;

internal static class MigratersConfig
{
    internal const string FileName = ".migraters.yaml";

    internal static IReadOnlyList<string> EnabledDialects()
    {
        var path = FindPath(Environment.CurrentDirectory);
        return path is null ? [] : ParseDialects(File.ReadAllText(path));
    }

    internal static string? FindPath(string start)
    {
        var dir = Path.GetFullPath(start);
        while (true)
        {
            var candidate = Path.Combine(dir, FileName);
            if (File.Exists(candidate))
                return candidate;
            var parent = Directory.GetParent(dir);
            if (parent is null)
                return null;
            dir = parent.FullName;
        }
    }

    internal static IReadOnlyList<string> ParseDialects(string raw)
    {
        var names = new List<string>();
        var inDialects = false;
        foreach (var line in raw.Split('\n'))
        {
            var trimmed = line.TrimEnd('\r');
            if (!inDialects)
            {
                if (trimmed.Trim() == "dialects:")
                    inDialects = true;
                continue;
            }
            var item = trimmed.Trim();
            if (item.StartsWith("- ", StringComparison.Ordinal))
            {
                var name = item[2..].Trim();
                if (name.Length > 0)
                    names.Add(name);
                continue;
            }
            if (item.Length == 0)
                continue;
            break;
        }
        return names;
    }
}
