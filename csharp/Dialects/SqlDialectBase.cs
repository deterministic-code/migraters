using System.Data.Common;

namespace Deterministic.MigrateRunner;

internal abstract class SqlDialectBase : ISqlDialect
{
    public abstract string Name { get; }
    public abstract IReadOnlyList<string> ConnectionEnvironmentVariables { get; }
    public abstract string MigratesDdl { get; }
    public abstract string MigrateLogsDdl { get; }
    public abstract bool UseTransaction { get; }

    public string SelectAppliedNamesSql =>
        $"SELECT {QuoteIdent("name")} FROM {QuoteIdent("migrates")}";

    public string SelectLastAppliedNameSql =>
        $"SELECT {QuoteIdent("name")} FROM {QuoteIdent("migrates")} ORDER BY {QuoteIdent("name")} DESC LIMIT 1";

    public string InsertAppliedSql =>
        $"INSERT INTO {QuoteIdent("migrates")} ({QuoteIdent("name")}, {QuoteIdent("checksum")}) VALUES ({Placeholder("p1")}, {Placeholder("p2")})";

    public string DeleteAppliedSql =>
        $"DELETE FROM {QuoteIdent("migrates")} WHERE {QuoteIdent("name")} = {Placeholder("p1")}";

    public abstract string NormalizeConnectionString(string connection);
    public abstract DbConnection CreateConnection(string connectionString);
    public abstract void AddParameter(DbCommand command, string name, object value);

    public virtual string? PrerequisiteError(string connection) => null;

    protected abstract string QuoteIdent(string ident);
    protected abstract string Placeholder(string name);

    protected static void Bind(DbCommand command, string parameterName, object value)
    {
        var p = command.CreateParameter();
        p.ParameterName = parameterName;
        p.Value = value;
        command.Parameters.Add(p);
    }
}
