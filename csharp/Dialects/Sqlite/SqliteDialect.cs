using Microsoft.Data.Sqlite;
using SQLitePCL;

namespace Deterministic.MigrateRunner;

public static class SqliteDialect
{
    static SqliteDialect()
    {
        Batteries.Init();
    }

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
        },
        PrepareSetup
    );

    private static void PrepareSetup(string connection)
    {
        var path = FilesystemPath(connection);
        if (path is null)
            return;
        var parent = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(parent))
            Directory.CreateDirectory(parent);
    }

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

    private static bool IsMemory(string? connection)
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

    private static string? FilesystemPath(string? connection)
    {
        if (IsMemory(connection))
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
}
