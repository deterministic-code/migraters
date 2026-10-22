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

    internal static string NormalizeConnection(string connection)
    {
        if (ConnectionStringUrl.TryUri(connection, "mysql") is not { } url)
            return connection;
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
        return b.ConnectionString;
    }
}
