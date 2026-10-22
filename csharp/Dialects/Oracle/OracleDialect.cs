using Oracle.ManagedDataAccess.Client;

namespace Deterministic.MigrateRunner;

public sealed class OracleDialect : SqlDialect
{
    public OracleDialect()
        : base(
            "oracle",
            useTransaction: true,
            NormalizeConnection,
            s => new OracleConnection(s),
            (cmd, n, v) => Bind(cmd, $":{n}", v),
            ident => $"\"{ident}\"",
            name => $":{name}",
            limitClause: n => $"FETCH FIRST {n} ROWS ONLY"
        ) { }

    internal static string NormalizeConnection(string connection)
    {
        var slash = connection.IndexOf('/');
        var at = connection.LastIndexOf('@');
        if (slash <= 0 || at <= slash)
            throw new ArgumentException(
                "Oracle connection must look like user/password@connectString"
            );
        var user = connection[..slash];
        var password = connection[(slash + 1)..at];
        var dataSource = connection[(at + 1)..];
        return $"User Id={user};Password={password};Data Source={dataSource}";
    }
}
