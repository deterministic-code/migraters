using Microsoft.Data.SqlClient;

namespace Deterministic.MigrateRunner;

public sealed class SqlServerDialect : SqlDialect
{
    public SqlServerDialect()
        : base(
            "sqlserver",
            useTransaction: true,
            connection => connection,
            s => new SqlConnection(s),
            (cmd, n, v) => Bind(cmd, $"@{n}", v),
            ident => $"[{ident}]",
            name => $"@{name}",
            createDatabase: SqlServerCreateDatabase.IfMissingAsync,
            nowExpr: "SYSUTCDATETIME()",
            limitClause: n => $"OFFSET 0 ROWS FETCH NEXT {n} ROWS ONLY"
        ) { }
}
