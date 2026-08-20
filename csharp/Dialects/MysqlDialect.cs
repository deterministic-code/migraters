using MySqlConnector;

namespace Deterministic.MigrateRunner;

internal static class MysqlDialect
{
    // MySQL DDL auto-commits, so wrapping apply + catalog write gives no atomicity.
    public static readonly ISqlDialect Instance = new SqlDialect(
        "mysql",
        ["MYSQL_URL", "DATABASE_URL"],
        useTransaction: false,
        NormalizeConnection,
        s => new MySqlConnection(s),
        (cmd, n, v) => SqlDialect.Bind(cmd, $"@{n}", v),
        ident => $"`{ident}`",
        name => $"@{name}"
    );

    private static string NormalizeConnection(string connection)
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
