namespace Deterministic.MigrateRunner;

internal interface ISqlDialect
{
    string Name { get; }
    IReadOnlyList<string> ConnectionEnvironmentVariables { get; }
    string MigratesDdl { get; }
    string MigrateLogsDdl { get; }
    string SelectAppliedChecksumSql { get; }
    string InsertAppliedSql { get; }
    string DeleteAppliedSql { get; }
    bool UseTransaction { get; }
    string NowExpr { get; }
    string LimitClause(int n);
    string QuoteIdent(string ident);
    string Placeholder(string name);
    string NormalizeConnectionString(string connection);
    DbConnection CreateConnection(string connectionString);
    string? PrerequisiteError(string connection);
    void PrepareSetup(string connection);
    void AddParameter(DbCommand command, string name, object value);
}
