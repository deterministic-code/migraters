using Microsoft.Data.SqlClient;

namespace Deterministic.MigrateRunner;

public static class SqlServerDialect
{
    public static readonly IDialect Instance = new SqlDialect(
        "sqlserver",
        ["MSSQL_URL", "DATABASE_URL"],
        useTransaction: true,
        connection => connection,
        s => new SqlConnection(s),
        (cmd, n, v) => SqlDialect.Bind(cmd, $"@{n}", v),
        ident => $"[{ident}]",
        name => $"@{name}",
        createDatabase: SqlServerCreateDatabase.IfMissingAsync,
        nowExpr: "SYSUTCDATETIME()",
        limitClause: n => $"OFFSET 0 ROWS FETCH NEXT {n} ROWS ONLY"
    );

}
