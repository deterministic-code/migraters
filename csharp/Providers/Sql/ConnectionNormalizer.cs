namespace Deterministic.MigrateRunner;

internal static class ConnectionNormalizer
{
    public static string Sqlite(string? connection)
    {
        var c = connection ?? string.Empty;
        if (c.Contains('=', StringComparison.Ordinal))
            return c;
        if (c.StartsWith("sqlite://", StringComparison.OrdinalIgnoreCase))
        {
            var path = c["sqlite://".Length..];
            return string.IsNullOrEmpty(path) ? "Data Source=:memory:" : $"Data Source={path}";
        }
        return string.IsNullOrEmpty(c) ? "Data Source=:memory:" : $"Data Source={c}";
    }

    public static bool SqliteIsMemory(string? connection)
    {
        var s = (connection ?? string.Empty).Trim();
        if (s.Length == 0 || string.Equals(s, ":memory:", StringComparison.Ordinal))
            return true;
        var compact = s.Replace(" ", string.Empty, StringComparison.Ordinal);
        return compact.Contains(":memory:", StringComparison.OrdinalIgnoreCase)
            || compact.Contains("?mode=memory", StringComparison.OrdinalIgnoreCase)
            || compact.Contains("&mode=memory", StringComparison.OrdinalIgnoreCase)
            || compact.Contains(";mode=memory", StringComparison.OrdinalIgnoreCase)
            || compact.StartsWith("mode=memory", StringComparison.OrdinalIgnoreCase);
    }

    public static string? SqliteFilesystemPath(string? connection)
    {
        if (SqliteIsMemory(connection))
            return null;
        var s = connection!.Trim();
        var eq = s.IndexOf('=', StringComparison.Ordinal);
        if (eq >= 0)
        {
            var key = s[..eq].Trim().Replace(" ", string.Empty);
            if (string.Equals(key, "DataSource", StringComparison.OrdinalIgnoreCase))
            {
                s = s[(eq + 1)..].Trim();
                var semi = s.IndexOf(';', StringComparison.Ordinal);
                if (semi >= 0)
                    s = s[..semi].Trim();
            }
        }
        foreach (var prefix in new[] { "sqlite://", "sqlite:", "file:" })
        {
            if (s.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                s = s[prefix.Length..];
                break;
            }
        }
        var q = s.IndexOf('?', StringComparison.Ordinal);
        if (q >= 0)
            s = s[..q];
        return s.Length == 0 ? null : s;
    }

    public static string Oracle(string connection)
    {
        var slash = connection.IndexOf('/');
        var at = connection.LastIndexOf('@');
        if (slash <= 0 || at <= slash)
            throw new ArgumentException("Oracle connection must look like user/password@connectString");
        var user = connection[..slash];
        var password = connection[(slash + 1)..at];
        var dataSource = connection[(at + 1)..];
        return $"User Id={user};Password={password};Data Source={dataSource}";
    }
}
