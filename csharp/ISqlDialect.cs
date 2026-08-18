using System.Data.Common;

namespace Deterministic.MigrateRunner;

internal interface ISqlDialect
{
    string Name { get; }
    IReadOnlyList<string> ConnectionEnvironmentVariables { get; }
    string MigratesDdl { get; }
    string MigrateLogsDdl { get; }
    string SelectAppliedNamesSql { get; }
    string SelectLastAppliedNameSql { get; }
    string InsertAppliedSql { get; }
    string DeleteAppliedSql { get; }
    bool UseTransaction { get; }
    string NormalizeConnectionString(string connection);
    DbConnection CreateConnection(string connectionString);
    string? PrerequisiteError(string connection);
    void AddParameter(DbCommand command, string name, object value);
}
