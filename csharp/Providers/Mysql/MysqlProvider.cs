using MySqlConnector;

namespace Deterministic.MigrateRunner;

public sealed class MysqlProvider : IDatasourceProvider
{
    private readonly SqlRun _sql = new(
        "mysql",
        useTransaction: false,
        NormalizeConnection,
        s => new MySqlConnection(s),
        (cmd, n, v) => SqlRun.Bind(cmd, $"@{n}", v),
        ident => $"`{ident}`",
        name => $"@{name}",
        createDatabase: MysqlCreateDatabase.IfMissingAsync
    );

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

    internal static string NormalizeConnection(string connection)
    {
        var b = ConnectionStringUrl.TryUri(connection, "mysql") is { } url
            ? FromMysqlUrl(url)
            : new MySqlConnectionStringBuilder(connection);
        b.AllowUserVariables = true;
        return b.ConnectionString;
    }

    private static MySqlConnectionStringBuilder FromMysqlUrl(string url)
    {
        var uri = new Uri(url);
        var b = new MySqlConnectionStringBuilder
        {
            Server = uri.Host,
            Port = (uint)(uri.Port > 0 ? uri.Port : 3306),
        };
        ConnectionStringUrl.ApplyUriParts(
            uri,
            (u, p) =>
            {
                if (u is not null)
                    b.UserID = u;
                if (p is not null)
                    b.Password = p;
            },
            db => b.Database = db,
            (k, v) => b[k] = v
        );
        return b;
    }
}
