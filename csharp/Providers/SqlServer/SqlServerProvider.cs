using Microsoft.Data.SqlClient;

namespace Deterministic.MigrateRunner;

public sealed class SqlServerProvider : IDatasourceProvider
{
    private readonly SqlRun _sql = new(
        "sqlserver",
        useTransaction: true,
        connection => connection,
        s => new SqlConnection(s),
        (cmd, n, v) => SqlRun.Bind(cmd, $"@{n}", v),
        ident => $"[{ident}]",
        name => $"@{name}",
        createDatabase: SqlServerCreateDatabase.IfMissingAsync,
        nowExpr: "SYSUTCDATETIME()",
        limitClause: n => $"OFFSET 0 ROWS FETCH NEXT {n} ROWS ONLY"
    );

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

    internal SqlRun Sql => _sql;
    public string NormalizeConnectionString(string connection) =>
        _sql.NormalizeConnectionString(connection);
    public string? PrerequisiteError(string connection) => _sql.PrerequisiteError(connection);
}
