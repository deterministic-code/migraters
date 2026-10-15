using Microsoft.Data.SqlClient;

namespace Deterministic.MigrateRunner;

internal static class SqlServerDialect
{
    public static readonly ISqlDialect Instance = new SqlDialect(
        "sqlserver",
        ["MSSQL_URL", "DATABASE_URL"],
        useTransaction: true,
        connection => connection,
        s => new SqlConnection(s),
        (cmd, n, v) => SqlDialect.Bind(cmd, $"@{n}", v),
        ident => $"[{ident}]",
        name => $"@{name}",
        nowExpr: "SYSUTCDATETIME()",
        limitClause: n => $"OFFSET 0 ROWS FETCH NEXT {n} ROWS ONLY"
    );
}
