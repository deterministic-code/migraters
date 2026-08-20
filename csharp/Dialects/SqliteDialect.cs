using Microsoft.Data.Sqlite;

namespace Deterministic.MigrateRunner;

internal static class SqliteDialect
{
    public static readonly ISqlDialect Instance = new SqlDialect(
        "sqlite",
        ["SQLITE_PATH", "DB_PATH"],
        useTransaction: true,
        NormalizeConnection,
        s => new SqliteConnection(s),
        (cmd, n, v) => SqlDialect.Bind(cmd, $"${n}", v),
        ident => $"\"{ident}\"",
        name => $"${name}",
        connection =>
        {
            var path = FilesystemPath(connection);
            return path is null || File.Exists(path)
                ? null
                : HelpTemplates.Message(
                    "errors/sqlite-prerequisite",
                    new Dictionary<string, string> { ["path"] = path }
                );
        }
    );

    private static string NormalizeConnection(string connection)
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

    private static string? FilesystemPath(string? connection)
    {
        var s = (connection ?? string.Empty).Trim();
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
        return s.Length == 0 || string.Equals(s, ":memory:", StringComparison.Ordinal) ? null : s;
    }
}
