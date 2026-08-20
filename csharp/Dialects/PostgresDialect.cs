using Npgsql;

namespace Deterministic.MigrateRunner;

internal static class PostgresDialect
{
    public static readonly ISqlDialect Instance = new SqlDialect(
        "postgres",
        ["PG_CONNECTION_STRING", "DATABASE_URL"],
        useTransaction: true,
        NormalizeConnection,
        s => new NpgsqlConnection(s),
        SqlDialect.Bind,
        ident => $"\"{ident}\"",
        name => $"@{name}"
    );

    private static string NormalizeConnection(string connection)
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
            (k, v) => b[k] = v
        );
        return b.ConnectionString;
    }
}
