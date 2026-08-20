namespace Deterministic.MigrateRunner;

internal sealed class SqlDialect : ISqlDialect
{
    private readonly Func<string, string> _normalize;
    private readonly Func<string, DbConnection> _createConnection;
    private readonly Action<DbCommand, string, object> _addParameter;
    private readonly Func<string, string> _quoteIdent;
    private readonly Func<string, string> _placeholder;
    private readonly Func<string, string?>? _prerequisiteError;

    public SqlDialect(
        string name,
        IReadOnlyList<string> connectionEnvironmentVariables,
        bool useTransaction,
        Func<string, string> normalizeConnectionString,
        Func<string, DbConnection> createConnection,
        Action<DbCommand, string, object> addParameter,
        Func<string, string> quoteIdent,
        Func<string, string> placeholder,
        Func<string, string?>? prerequisiteError = null
    )
    {
        Name = name;
        ConnectionEnvironmentVariables = connectionEnvironmentVariables;
        UseTransaction = useTransaction;
        _normalize = normalizeConnectionString;
        _createConnection = createConnection;
        _addParameter = addParameter;
        _quoteIdent = quoteIdent;
        _placeholder = placeholder;
        _prerequisiteError = prerequisiteError;
    }

    public string Name { get; }
    public IReadOnlyList<string> ConnectionEnvironmentVariables { get; }
    public bool UseTransaction { get; }
    public string MigratesDdl => SqlTemplates.Read(Name, "migrates");
    public string MigrateLogsDdl => SqlTemplates.Read(Name, "migrate_logs");
    public string SelectAppliedNamesSql =>
        $"SELECT {_quoteIdent("name")} FROM {_quoteIdent("migrates")}";
    public string SelectLastAppliedNameSql =>
        $"SELECT {_quoteIdent("name")} FROM {_quoteIdent("migrates")} ORDER BY {_quoteIdent("name")} DESC LIMIT 1";
    public string InsertAppliedSql =>
        $"INSERT INTO {_quoteIdent("migrates")} ({_quoteIdent("name")}, {_quoteIdent("checksum")}) VALUES ({_placeholder("p1")}, {_placeholder("p2")})";
    public string DeleteAppliedSql =>
        $"DELETE FROM {_quoteIdent("migrates")} WHERE {_quoteIdent("name")} = {_placeholder("p1")}";

    public string NormalizeConnectionString(string connection) => _normalize(connection);
    public DbConnection CreateConnection(string connectionString) => _createConnection(connectionString);
    public void AddParameter(DbCommand command, string name, object value) =>
        _addParameter(command, name, value);
    public string? PrerequisiteError(string connection) => _prerequisiteError?.Invoke(connection);

    public static void Bind(DbCommand command, string parameterName, object value)
    {
        var p = command.CreateParameter();
        p.ParameterName = parameterName;
        p.Value = value;
        command.Parameters.Add(p);
    }
}
