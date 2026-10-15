namespace Deterministic.MigrateRunner;

internal sealed class SqlDialect : ISqlDialect
{
    private readonly Func<string, string> _normalize;
    private readonly Func<string, DbConnection> _createConnection;
    private readonly Action<DbCommand, string, object> _addParameter;
    private readonly Func<string, string> _quoteIdent;
    private readonly Func<string, string> _placeholder;
    private readonly Func<string, string?>? _prerequisiteError;
    private readonly Action<string>? _prepareSetup;
    private readonly Func<int, string> _limitClause;

    public SqlDialect(
        string name,
        IReadOnlyList<string> connectionEnvironmentVariables,
        bool useTransaction,
        Func<string, string> normalizeConnectionString,
        Func<string, DbConnection> createConnection,
        Action<DbCommand, string, object> addParameter,
        Func<string, string> quoteIdent,
        Func<string, string> placeholder,
        Func<string, string?>? prerequisiteError = null,
        Action<string>? prepareSetup = null,
        string nowExpr = "CURRENT_TIMESTAMP",
        Func<int, string>? limitClause = null
    )
    {
        Name = name;
        ConnectionEnvironmentVariables = connectionEnvironmentVariables;
        UseTransaction = useTransaction;
        NowExpr = nowExpr;
        _normalize = normalizeConnectionString;
        _createConnection = createConnection;
        _addParameter = addParameter;
        _quoteIdent = quoteIdent;
        _placeholder = placeholder;
        _prerequisiteError = prerequisiteError;
        _prepareSetup = prepareSetup;
        _limitClause = limitClause ?? (n => $"LIMIT {n}");
    }

    public string Name { get; }
    public IReadOnlyList<string> ConnectionEnvironmentVariables { get; }
    public bool UseTransaction { get; }
    public string NowExpr { get; }
    public string MigratesDdl => SqlTemplates.Read(Name, "migrates");
    public string MigrateLogsDdl => SqlTemplates.Read(Name, "migrate_logs");
    public string SelectAppliedNamesSql =>
        $"SELECT {_quoteIdent("name")} FROM {_quoteIdent("migrates")}";
    public string SelectAppliedChecksumSql =>
        $"SELECT {_quoteIdent("name")} AS name, {_quoteIdent("checksum")} AS checksum FROM {_quoteIdent("migrates")}";
    public string SelectLastAppliedNameSql =>
        $"SELECT {_quoteIdent("name")} FROM {_quoteIdent("migrates")} ORDER BY {_quoteIdent("name")} DESC {_limitClause(1)}";
    public string InsertAppliedSql =>
        $"INSERT INTO {_quoteIdent("migrates")} ({_quoteIdent("name")}, {_quoteIdent("checksum")}) VALUES ({_placeholder("p1")}, {_placeholder("p2")})";
    public string DeleteAppliedSql =>
        $"DELETE FROM {_quoteIdent("migrates")} WHERE {_quoteIdent("name")} = {_placeholder("p1")}";

    public string LimitClause(int n) => _limitClause(n);
    public string QuoteIdent(string ident) => _quoteIdent(ident);
    public string Placeholder(string name) => _placeholder(name);
    public string NormalizeConnectionString(string connection) => _normalize(connection);
    public DbConnection CreateConnection(string connectionString) => _createConnection(connectionString);
    public void AddParameter(DbCommand command, string name, object value) =>
        _addParameter(command, name, value);
    public string? PrerequisiteError(string connection) => _prerequisiteError?.Invoke(connection);
    public void PrepareSetup(string connection) => _prepareSetup?.Invoke(connection);

    public static void Bind(DbCommand command, string parameterName, object value)
    {
        var p = command.CreateParameter();
        p.ParameterName = parameterName;
        p.Value = value;
        command.Parameters.Add(p);
    }
}
