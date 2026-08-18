using System.Data.Common;
using Microsoft.Data.Sqlite;

namespace Deterministic.MigrateRunner;

internal sealed class SqliteDialect : SqlDialectBase
{
    public override string Name => "sqlite";

    public override IReadOnlyList<string> ConnectionEnvironmentVariables { get; } =
        new[] { "SQLITE_PATH", "DB_PATH" };

    public override string MigratesDdl => SqlTemplates.Read(Name, "migrates");
    public override string MigrateLogsDdl => SqlTemplates.Read(Name, "migrate_logs");
    public override bool UseTransaction => true;

    public override string NormalizeConnectionString(string connection)
    {
        var c = connection ?? string.Empty;
        if (c.Contains('=', StringComparison.Ordinal))
        {
            return c;
        }
        if (c.StartsWith("sqlite://", StringComparison.OrdinalIgnoreCase))
        {
            var path = c.Substring("sqlite://".Length);
            return string.IsNullOrEmpty(path) ? "Data Source=:memory:" : $"Data Source={path}";
        }
        return string.IsNullOrEmpty(c) ? "Data Source=:memory:" : $"Data Source={c}";
    }

    public override DbConnection CreateConnection(string connectionString) =>
        new SqliteConnection(connectionString);

    public override string? PrerequisiteError(string connection)
    {
        var path = FilesystemPath(connection);
        if (path is null || File.Exists(path))
        {
            return null;
        }
        return $"sqlite file: {path} does not exist — run 'migrate-setup --provider sqlite --connection {path}' to create it";
    }

    public override void AddParameter(DbCommand command, string name, object value) =>
        Bind(command, $"${name}", value);

    protected override string QuoteIdent(string ident) => $"\"{ident}\"";
    protected override string Placeholder(string name) => $"${name}";

    private static string? FilesystemPath(string? connection)
    {
        var s = (connection ?? string.Empty).Trim();
        var eq = s.IndexOf('=', StringComparison.Ordinal);
        if (eq >= 0)
        {
            var key = s.Substring(0, eq).Trim().Replace(" ", string.Empty);
            if (string.Equals(key, "DataSource", StringComparison.OrdinalIgnoreCase))
            {
                s = s.Substring(eq + 1).Trim();
                var semi = s.IndexOf(';', StringComparison.Ordinal);
                if (semi >= 0)
                {
                    s = s.Substring(0, semi).Trim();
                }
            }
        }
        if (s.StartsWith("sqlite://", StringComparison.OrdinalIgnoreCase))
        {
            s = s.Substring("sqlite://".Length);
        }
        else if (s.StartsWith("sqlite:", StringComparison.OrdinalIgnoreCase))
        {
            s = s.Substring("sqlite:".Length);
        }
        else if (s.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
        {
            s = s.Substring("file:".Length);
        }
        if (s.Length == 0 || string.Equals(s, ":memory:", StringComparison.Ordinal))
        {
            return null;
        }
        return s;
    }
}
