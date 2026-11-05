namespace Deterministic.MigrateRunner;

internal sealed record ProviderEntry(string Name);

internal static class MigratersConfig
{
    internal const string FileName = ".migraters.yaml";

    internal static IReadOnlyList<ProviderEntry> EnabledProviders()
    {
        var path = FindPath(Environment.CurrentDirectory);
        return path is null ? [] : ParseProviders(File.ReadAllText(path));
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

    internal static IReadOnlyList<ProviderEntry> ParseProviders(string raw)
    {
        var entries = new List<ProviderEntry>();
        var inProviders = false;
        string? name = null;
        void Take()
        {
            if (name is { Length: > 0 })
                entries.Add(new ProviderEntry(name));
            name = null;
        }
        foreach (var line in raw.Split('\n'))
        {
            var trimmed = line.TrimEnd('\r');
            if (!inProviders)
            {
                if (trimmed.Trim() == "providers:")
                    inProviders = true;
                continue;
            }
            var item = trimmed.Trim();
            if (item.StartsWith("- name:", StringComparison.Ordinal))
            {
                Take();
                name = item["- name:".Length..].Trim();
                continue;
            }
            if (item.StartsWith("location:", StringComparison.Ordinal))
                continue;
            if (item.Length == 0)
                continue;
            if (item.StartsWith("- ", StringComparison.Ordinal))
                continue;
            break;
        }
        Take();
        return entries;
    }
}
