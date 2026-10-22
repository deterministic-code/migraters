using Oracle.ManagedDataAccess.Client;

namespace Deterministic.MigrateRunner;

public sealed class OracleProvider : IDatasourceProvider
{
    private readonly SqlDialect _sql = new(
        "oracle",
        useTransaction: true,
        NormalizeConnection,
        s => new OracleConnection(s),
        (cmd, n, v) => SqlDialect.Bind(cmd, $":{n}", v),
        ident => $"\"{ident}\"",
        name => $":{name}",
        limitClause: n => $"FETCH FIRST {n} ROWS ONLY"
    );

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

    internal static string NormalizeConnection(string connection)
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
