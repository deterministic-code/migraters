using Npgsql;

namespace Deterministic.MigrateRunner;

public sealed class PostgresProvider : IDatasourceProvider
{
    private readonly SqlRun _sql = new(
        "postgres",
        useTransaction: true,
        NormalizeConnection,
        s => new NpgsqlConnection(s),
        SqlRun.Bind,
        ident => $"\"{ident}\"",
        name => $"@{name}",
        createDatabase: PostgresCreateDatabase.IfMissingAsync
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
        if (ConnectionStringUrl.TryUri(connection, "postgres", "postgresql") is not { } url)
            return connection;
        var uri = new Uri(url);
        var b = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
        };
        ConnectionStringUrl.ApplyUriParts(
            uri,
            (u, p) =>
            {
                if (u is not null)
                    b.Username = u;
                if (p is not null)
                    b.Password = p;
            },
            db => b.Database = db,
            (k, v) =>
            {
                _ = k switch
                {
                    "schema" => b.SearchPath = v,
                    _ => b[k] = v,
                };
            }
        );
        return b.ConnectionString;
    }
}
