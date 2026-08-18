// Default: applies ALL pending migrations in sequence, each in its own transaction. Pass --one to apply only the next pending migration (legacy one-shot behavior; useful when wrapping in an external loop or when you want to inspect state between steps).

using System.Data.Common;

namespace Deterministic.MigrateRunner;

internal sealed class MigrateUp : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("up");

    private readonly ISqlDialectFactory _dialects;
    private readonly IConnectionResolver _connections;

    public MigrateUp(ISqlDialectFactory dialects, IConnectionResolver connections)
    {
        _dialects = dialects;
        _connections = connections;
    }

    public string Name => "up";

    public async Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var migratePath, out var connection, out var one, out var showHelp, out var error))
        {
            if (showHelp)
            {
                Console.Error.Write(HelpText);
                return 0;
            }
            Console.Error.WriteLine(error);
            Console.Error.Write(HelpText);
            return 2;
        }

        if (!_dialects.TryGet(provider, out var dialect))
        {
            Console.Error.WriteLine($"unsupported provider: {provider}");
            return 2;
        }

        var prerequisite = dialect.PrerequisiteError(connection!);
        if (prerequisite is not null)
        {
            Console.Error.WriteLine(prerequisite);
            return 2;
        }

        try
        {
            return await ApplyPendingAsync(dialect, migratePath, connection!, one).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"migrate-up failed: {ex.Message}");
            return 1;
        }
    }

    private static async Task<int> ApplyPendingAsync(ISqlDialect dialect, string migratePath, string connection, bool one)
    {
        await using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(connection));
        await conn.OpenAsync().ConfigureAwait(false);

        var applied = await LoadAppliedAsync(conn, dialect.SelectAppliedNamesSql).ConfigureAwait(false);
        var appliedCount = 0;
        while (true)
        {
            if (!TryNext(migratePath, applied, out var name, out var path))
            {
                Console.WriteLine(appliedCount == 0 ? "No pending migrations." : "No more pending migrations.");
                return 0;
            }

            var sql = await File.ReadAllTextAsync(path).ConfigureAwait(false);
            var checksum = FnvChecksum.Hex(sql);

            await DbExecute.ApplyStatementsAsync(conn, dialect, sql, tx =>
                DbExecute.CatalogWriteAsync(
                    conn,
                    tx,
                    dialect,
                    dialect.InsertAppliedSql,
                    ("p1", name),
                    ("p2", checksum))).ConfigureAwait(false);

            Console.WriteLine($"Applied: {name}");
            applied.Add(name);
            appliedCount++;
            if (one) return 0;
        }
    }

    private static async Task<HashSet<string>> LoadAppliedAsync(DbConnection conn, string sql)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        using var reader = await cmd.ExecuteReaderAsync().ConfigureAwait(false);
        while (await reader.ReadAsync().ConfigureAwait(false))
        {
            set.Add(reader.GetString(0));
        }
        return set;
    }

    private static bool TryNext(string migratePath, HashSet<string> applied, out string name, out string path)
    {
        name = string.Empty;
        path = string.Empty;
        if (!Directory.Exists(migratePath))
        {
            throw new DirectoryNotFoundException($"migrate-path is not a directory: {migratePath}");
        }
        var files = Directory.EnumerateFiles(migratePath)
            .Where(p => Path.GetFileName(p).EndsWith("_up.sql", StringComparison.Ordinal))
            .OrderBy(p => Path.GetFileName(p), StringComparer.Ordinal)
            .ToList();
        foreach (var p in files)
        {
            var n = Path.GetFileName(p);
            if (!applied.Contains(n))
            {
                name = n;
                path = p;
                return true;
            }
        }
        return false;
    }

    private bool TryParse(string[] args, out string provider, out string migratePath, out string? connection, out bool one, out bool showHelp, out string error)
    {
        provider = string.Empty;
        migratePath = string.Empty;
        var migrateRoot = (string?)null;
        connection = null;
        one = false;
        showHelp = false;
        error = string.Empty;
        for (var i = 0; i < args.Length; i++)
        {
            var a = args[i];
            switch (a)
            {
                case "--provider":
                    if (i + 1 >= args.Length) { error = "missing value for --provider"; return false; }
                    provider = args[++i];
                    break;
                // --migrate-path / --migrate-root are silent aliases retained for backward compat.
                case "--migrations-path":
                case "--migrate-path":
                    if (i + 1 >= args.Length) { error = $"missing value for {a}"; return false; }
                    migratePath = args[++i];
                    break;
                case "--migrations-root":
                case "--migrate-root":
                    if (i + 1 >= args.Length) { error = $"missing value for {a}"; return false; }
                    migrateRoot = args[++i];
                    break;
                case "--connection":
                    if (i + 1 >= args.Length) { error = "missing value for --connection"; return false; }
                    connection = args[++i];
                    break;
                case "--one":
                    one = true;
                    break;
                case "-h":
                case "--help":
                    showHelp = true;
                    return false;
                default:
                    error = $"unknown arg: {a}";
                    return false;
            }
        }
        if (string.IsNullOrEmpty(provider)) { error = "missing --provider"; return false; }
        if (string.IsNullOrEmpty(migratePath))
        {
            var root = migrateRoot ?? "sql";
            migratePath = $"{root}/{provider}/migrations";
        }
        _dialects.TryGet(provider, out var dialect);
        if (string.IsNullOrEmpty(connection) && dialect is not null)
        {
            connection = _connections.FromEnvironment(dialect);
        }
        if (string.IsNullOrEmpty(connection))
        {
            var vars = dialect?.ConnectionEnvironmentVariables ?? Array.Empty<string>();
            error = $"missing --connection — pass --connection <url> (e.g. ./app.sqlite for sqlite) or set one of: {string.Join(", ", vars)}. Run with --help for examples.";
            return false;
        }
        return true;
    }
}
