using Microsoft.Data.Sqlite;
using SQLitePCL;

namespace Deterministic.MigrateRunner;

public sealed class SqliteProvider : IDatasourceProvider
{
    private readonly SqlRun _sql;

    static SqliteProvider() => Batteries.Init();

    public SqliteProvider()
    {
        _sql = new SqlRun(
            "sqlite",
            useTransaction: true,
            ConnectionNormalizer.Sqlite,
            s => new SqliteConnection(s),
            (cmd, n, v) => SqlRun.Bind(cmd, $"${n}", v),
            ident => $"\"{ident}\"",
            name => $"${name}",
            connection =>
            {
                var path = ConnectionNormalizer.SqliteFilesystemPath(connection);
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

    public string Name => _sql.Name;
    public void PrepareSetup(string connection) => _sql.PrepareSetup(connection);
    public Task CreateDatabaseIfMissingAsync(string connection) =>
        _sql.CreateDatabaseIfMissingAsync(connection);
    public Task Setup(string connection) => _sql.Setup(connection);
    public Task<IReadOnlyDictionary<string, string?>> Applied(string connection) =>
        _sql.Applied(connection);
    public Task MigrateUp(string connection, string name, string body, string checksum, string batchSeparator = "GO") =>
        _sql.MigrateUp(connection, name, body, checksum, batchSeparator);
    public Task MigrateDown(string connection, string name, string body, string batchSeparator = "GO") =>
        _sql.MigrateDown(connection, name, body, batchSeparator);
    public Task<long> Log(
        string connection,
        long? id,
        string name,
        string direction,
        string? status,
        long durationMs,
        string? error
    ) => _sql.Log(connection, id, name, direction, status, durationMs, error);

    internal SqlRun Sql => _sql;
    public string NormalizeConnectionString(string connection) =>
        _sql.NormalizeConnectionString(connection);
    public string? PrerequisiteError(string connection) => _sql.PrerequisiteError(connection);

    private static void PrepareParent(string connection)
    {
        var path = ConnectionNormalizer.SqliteFilesystemPath(connection);
        if (path is null)
            return;
        var parent = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(parent))
            Directory.CreateDirectory(parent);
    }
}
