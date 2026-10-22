namespace Deterministic.MigrateRunner;

public class SqlDialect : IDatasourceProvider
{
    private readonly ConcurrentDictionary<string, DbConnection> _open = new(StringComparer.Ordinal);
    private readonly Func<string, string> _normalize;
    private readonly Func<string, DbConnection> _createConnection;
    private readonly Action<DbCommand, string, object> _addParameter;
    private readonly Func<string, string> _quoteIdent;
    private readonly Func<string, string> _placeholder;
    private readonly Func<string, string?>? _prerequisiteError;
    private readonly Action<string>? _prepareSetup;
    private readonly Func<string, Task>? _createDatabase;
    private readonly Func<int, string> _limitClause;

    protected SqlDialect(
        string name,
        bool useTransaction,
        Func<string, string> normalizeConnectionString,
        Func<string, DbConnection> createConnection,
        Action<DbCommand, string, object> addParameter,
        Func<string, string> quoteIdent,
        Func<string, string> placeholder,
        Func<string, string?>? prerequisiteError = null,
        Action<string>? prepareSetup = null,
        Func<string, Task>? createDatabase = null,
        string nowExpr = "CURRENT_TIMESTAMP",
        Func<int, string>? limitClause = null
    )
    {
        Name = name;
        UseTransaction = useTransaction;
        NowExpr = nowExpr;
        _normalize = normalizeConnectionString;
        _createConnection = createConnection;
        _addParameter = addParameter;
        _quoteIdent = quoteIdent;
        _placeholder = placeholder;
        _prerequisiteError = prerequisiteError;
        _prepareSetup = prepareSetup;
        _createDatabase = createDatabase;
        _limitClause = limitClause ?? (n => $"LIMIT {n}");
    }

    public string Name { get; }
    public bool UseTransaction { get; }
    public string NowExpr { get; }
    public string MigratesDdl => SqlTemplates.Read(Name, "migrates");
    public string MigrateLogsDdl => SqlTemplates.Read(Name, "migrate_logs");
    public string SelectAppliedChecksumSql =>
        $"SELECT {_quoteIdent("name")} AS name, {_quoteIdent("checksum")} AS checksum FROM {_quoteIdent("migrates")}";
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
    public Task CreateDatabaseIfMissingAsync(string connection) =>
        _createDatabase?.Invoke(connection) ?? Task.CompletedTask;

    public async Task Setup(string connection)
    {
        var conn = await OpenAsync(connection, requireExisting: false).ConfigureAwait(false);
        await DbExecute.NonQueryAsync(conn, null, MigratesDdl).ConfigureAwait(false);
        await DbExecute.NonQueryAsync(conn, null, MigrateLogsDdl).ConfigureAwait(false);
    }

    public async Task<IReadOnlyDictionary<string, string?>> Applied(string connection)
    {
        var conn = await OpenAsync(connection, requireExisting: true).ConfigureAwait(false);
        return await SqlCatalog.AppliedAsync(conn, this).ConfigureAwait(false);
    }

    public async Task MigrateUp(string connection, string name, string body, string checksum)
    {
        var conn = await OpenAsync(connection, requireExisting: true).ConfigureAwait(false);
        await DbExecute.ApplyStatementsAsync(
            conn,
            this,
            body,
            tx =>
                DbExecute.CatalogWriteAsync(
                    conn,
                    tx,
                    this,
                    InsertAppliedSql,
                    ("p1", name),
                    ("p2", checksum)
                )
        ).ConfigureAwait(false);
    }

    public async Task MigrateDown(string connection, string name, string body)
    {
        var conn = await OpenAsync(connection, requireExisting: true).ConfigureAwait(false);
        await DbExecute.ApplyStatementsAsync(
            conn,
            this,
            body,
            tx => DbExecute.CatalogWriteAsync(conn, tx, this, DeleteAppliedSql, ("p1", name))
        ).ConfigureAwait(false);
    }

    public async Task<long> Log(
        string connection,
        long? id,
        string name,
        string direction,
        string? status,
        long durationMs,
        string? error
    )
    {
        var conn = await OpenAsync(connection, requireExisting: id is not null).ConfigureAwait(false);
        if (id is null)
            return await SqlCatalog.InsertLogStartedAsync(conn, this, name, direction).ConfigureAwait(false);
        await SqlCatalog.UpdateLogAsync(conn, this, id.Value, status ?? "started", durationMs, error)
            .ConfigureAwait(false);
        return id.Value;
    }

    public static void Bind(DbCommand command, string parameterName, object value)
    {
        var p = command.CreateParameter();
        p.ParameterName = parameterName;
        p.Value = value;
        command.Parameters.Add(p);
    }

    private async Task<DbConnection> OpenAsync(string connection, bool requireExisting)
    {
        if (requireExisting && PrerequisiteError(connection) is { } error)
            throw new InvalidOperationException(error);
        var key = _normalize(connection);
        if (_open.TryGetValue(key, out var existing))
            return existing;
        var conn = _createConnection(key);
        await conn.OpenAsync().ConfigureAwait(false);
        _open[key] = conn;
        return conn;
    }
}
