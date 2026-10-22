using Microsoft.Data.Sqlite;
using SQLitePCL;

namespace Deterministic.MigrateRunner;

public sealed class SqliteProvider : IDatasourceProvider
{
    private readonly SqlDialect _sql;

    static SqliteProvider() => Batteries.Init();

    public SqliteProvider()
    {
        _sql = new SqlDialect(
            "sqlite",
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
            PrepareParent
        );
    }

    internal SqlDialect Sql => _sql;
    public string Name => _sql.Name;
    public void PrepareSetup(string connection) => _sql.PrepareSetup(connection);
    public Task CreateDatabaseIfMissingAsync(string connection) =>
        _sql.CreateDatabaseIfMissingAsync(connection);
    public Task Setup(string connection) => _sql.Setup(connection);
    public Task<IReadOnlyDictionary<string, string?>> Applied(string connection) =>
        _sql.Applied(connection);
    public Task MigrateUp(string connection, string name, string body, string checksum) =>
        _sql.MigrateUp(connection, name, body, checksum);
    public Task MigrateDown(string connection, string name, string body) =>
        _sql.MigrateDown(connection, name, body);
    public Task<long> Log(
        string connection,
        long? id,
        string name,
        string direction,
        string? status,
        long durationMs,
        string? error
    ) => _sql.Log(connection, id, name, direction, status, durationMs, error);

    public string NormalizeConnectionString(string connection) =>
        _sql.NormalizeConnectionString(connection);
    public string? PrerequisiteError(string connection) => _sql.PrerequisiteError(connection);

    private static void PrepareParent(string connection)
    {
        var path = FilesystemPath(connection);
        if (path is null)
            return;
        var parent = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(parent))
            Directory.CreateDirectory(parent);
    }

    internal static string NormalizeConnection(string connection)
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
