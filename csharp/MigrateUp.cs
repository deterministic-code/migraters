// Default: applies ALL pending migrations in sequence, each in its own transaction. Pass --one to apply only the next pending migration (legacy one-shot behavior; useful when wrapping in an external loop or when you want to inspect state between steps).

using System.Data.Common;
using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;
using MySqlConnector;
using Npgsql;

namespace Deterministic.MigrateRunner;

internal static class MigrateUp
{
    private static readonly string HelpText = HelpTemplates.Read("up");

    public static async Task<int> RunAsync(string[] args)
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

        if (provider == "sqlite")
        {
            var sqlitePath = ProviderConnectionString.SqliteFilesystemPath(connection);
            if (sqlitePath is not null && !File.Exists(sqlitePath))
            {
                Console.Error.WriteLine(
                    $"sqlite file: {sqlitePath} does not exist — run 'migrate-setup --provider sqlite --connection {sqlitePath}' to create it");
                return 2;
            }
        }

        try
        {
            return provider switch
            {
                "sqlite" => await RunSqliteAsync(migratePath, connection!, one).ConfigureAwait(false),
                "postgres" => await RunPostgresAsync(migratePath, connection!, one).ConfigureAwait(false),
                "mysql" => await RunMysqlAsync(migratePath, connection!, one).ConfigureAwait(false),
                _ => Unsupported(provider),
            };
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"migrate-up failed: {ex.Message}");
            return 1;
        }
    }

    private static int Unsupported(string provider)
    {
        Console.Error.WriteLine($"unsupported provider: {provider}");
        return 2;
    }

    private static async Task<int> RunSqliteAsync(string migratePath, string connection, bool one)
    {
        await using var conn = new SqliteConnection(ProviderConnectionString.Sqlite(connection));
        await conn.OpenAsync().ConfigureAwait(false);

        var applied = await LoadAppliedAsync(conn, @"SELECT ""name"" FROM ""migrates""").ConfigureAwait(false);
        var appliedCount = 0;
        while (true)
        {
            if (!TryNext(migratePath, applied, out var name, out var path))
            {
                Console.WriteLine(appliedCount == 0 ? "No pending migrations." : "No more pending migrations.");
                return 0;
            }

            var sql = await File.ReadAllTextAsync(path).ConfigureAwait(false);
            var checksum = ChecksumHex(sql);

            await using (var tx = (SqliteTransaction)await conn.BeginTransactionAsync().ConfigureAwait(false))
            {
                foreach (var stmt in SplitStatements(sql))
                {
                    await ExecuteAsync(conn, tx, stmt).ConfigureAwait(false);
                }
                await using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"INSERT INTO ""migrates"" (""name"", ""checksum"") VALUES ($p1, $p2)";
                    AddParam(ins, "$p1", name);
                    AddParam(ins, "$p2", checksum);
                    await ins.ExecuteNonQueryAsync().ConfigureAwait(false);
                }
                await tx.CommitAsync().ConfigureAwait(false);
            }
            Console.WriteLine($"Applied: {name}");
            applied.Add(name);
            appliedCount++;
            if (one) return 0;
        }
    }

    private static async Task<int> RunPostgresAsync(string migratePath, string connection, bool one)
    {
        await using var conn = new NpgsqlConnection(ProviderConnectionString.Postgres(connection));
        await conn.OpenAsync().ConfigureAwait(false);

        var applied = await LoadAppliedAsync(conn, @"SELECT ""name"" FROM ""migrates""").ConfigureAwait(false);
        var appliedCount = 0;
        while (true)
        {
            if (!TryNext(migratePath, applied, out var name, out var path))
            {
                Console.WriteLine(appliedCount == 0 ? "No pending migrations." : "No more pending migrations.");
                return 0;
            }

            var sql = await File.ReadAllTextAsync(path).ConfigureAwait(false);
            var checksum = ChecksumHex(sql);

            await using (var tx = await conn.BeginTransactionAsync().ConfigureAwait(false))
            {
                foreach (var stmt in SplitStatements(sql))
                {
                    await ExecuteAsync(conn, tx, stmt).ConfigureAwait(false);
                }
                await using (var ins = conn.CreateCommand())
                {
                    ins.Transaction = tx;
                    ins.CommandText = @"INSERT INTO ""migrates"" (""name"", ""checksum"") VALUES (@p1, @p2)";
                    AddParam(ins, "p1", name);
                    AddParam(ins, "p2", checksum);
                    await ins.ExecuteNonQueryAsync().ConfigureAwait(false);
                }
                await tx.CommitAsync().ConfigureAwait(false);
            }
            Console.WriteLine($"Applied: {name}");
            applied.Add(name);
            appliedCount++;
            if (one) return 0;
        }
    }

    private static async Task<int> RunMysqlAsync(string migratePath, string connection, bool one)
    {
        await using var conn = new MySqlConnection(ProviderConnectionString.Mysql(connection));
        await conn.OpenAsync().ConfigureAwait(false);

        var applied = await LoadAppliedAsync(conn, "SELECT `name` FROM `migrates`").ConfigureAwait(false);
        var appliedCount = 0;
        while (true)
        {
            if (!TryNext(migratePath, applied, out var name, out var path))
            {
                Console.WriteLine(appliedCount == 0 ? "No pending migrations." : "No more pending migrations.");
                return 0;
            }

            var sql = await File.ReadAllTextAsync(path).ConfigureAwait(false);
            var checksum = ChecksumHex(sql);

            // why no transaction: MySQL DDL auto-commits, so wrapping apply+INSERT gives no atomicity guarantee — mirror runUp's sequential execute+INSERT.
            foreach (var stmt in SplitStatements(sql))
            {
                await ExecuteAsync(conn, null, stmt).ConfigureAwait(false);
            }
            await using (var ins = conn.CreateCommand())
            {
                ins.CommandText = "INSERT INTO `migrates` (`name`, `checksum`) VALUES (@p1, @p2)";
                AddParam(ins, "@p1", name);
                AddParam(ins, "@p2", checksum);
                await ins.ExecuteNonQueryAsync().ConfigureAwait(false);
            }
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

    private static async Task ExecuteAsync(DbConnection conn, DbTransaction? tx, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        if (tx is not null)
        {
            cmd.Transaction = tx;
        }
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
    }

    private static void AddParam(DbCommand cmd, string name, object value)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        cmd.Parameters.Add(p);
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

    // FNV-1a 64-bit hex — matches checksum_hex in scripts/templates/create-backend-app/rust/migrate_up.rs so checksums round-trip across runners.
    private static string ChecksumHex(string sql)
    {
        ulong hash = 0xcbf29ce484222325UL;
        foreach (var b in Encoding.UTF8.GetBytes(sql))
        {
            hash ^= b;
            hash = unchecked(hash * 0x100000001b3UL);
        }
        return hash.ToString("x16", CultureInfo.InvariantCulture);
    }

    // Block-aware: BEGIN/END (case-insensitive) inside a CREATE TRIGGER body is tracked so the inner UPDATE's `;` does not terminate the outer statement (sqlite error code 1 "incomplete input" otherwise).
    internal static List<string> SplitStatements(string sql)
    {
        var outList = new List<string>();
        var buf = new StringBuilder();
        var inSingle = false;
        var inDouble = false;
        var inLine = false;
        var inBlock = false;
        string? dollarTag = null;
        var blockDepth = 0;
        var word = new StringBuilder();
        for (var i = 0; i < sql.Length; i++)
        {
            var c = sql[i];
            char? next = i + 1 < sql.Length ? sql[i + 1] : null;
            if (!inLine && !inBlock && dollarTag is null && !inSingle && !inDouble)
            {
                if (c == '-' && next == '-')
                {
                    inLine = true;
                    buf.Append(c);
                    continue;
                }
                if (c == '/' && next == '*')
                {
                    inBlock = true;
                    buf.Append(c);
                    continue;
                }
                if (c == '$')
                {
                    var j = i + 1;
                    while (j < sql.Length && sql[j] != '$') { j++; }
                    if (j < sql.Length)
                    {
                        var tag = sql.Substring(i, j - i + 1);
                        dollarTag = tag;
                        buf.Append(tag);
                        i = j;
                        continue;
                    }
                }
            }
            if (inLine)
            {
                buf.Append(c);
                if (c == '\n') { inLine = false; }
                continue;
            }
            if (inBlock)
            {
                buf.Append(c);
                if (c == '*' && next == '/')
                {
                    buf.Append('/');
                    inBlock = false;
                    i++;
                }
                continue;
            }
            if (dollarTag is not null)
            {
                buf.Append(c);
                if (c == '$')
                {
                    var end = i + dollarTag.Length;
                    if (end <= sql.Length)
                    {
                        var candidate = sql.Substring(i, dollarTag.Length);
                        if (candidate == dollarTag)
                        {
                            for (var k = i + 1; k < end; k++) { buf.Append(sql[k]); }
                            dollarTag = null;
                            i = end - 1;
                        }
                    }
                }
                continue;
            }
            if (inSingle)
            {
                buf.Append(c);
                if (c == '\'') { inSingle = false; }
                continue;
            }
            if (inDouble)
            {
                buf.Append(c);
                if (c == '"') { inDouble = false; }
                continue;
            }
            if (c == '\'') { inSingle = true; buf.Append(c); continue; }
            if (c == '"') { inDouble = true; buf.Append(c); continue; }
            if (char.IsLetter(c) || c == '_')
            {
                word.Append(c);
                buf.Append(c);
                continue;
            }
            if (word.Length > 0)
            {
                var upper = word.ToString().ToUpperInvariant();
                if (upper == "BEGIN") { blockDepth++; }
                else if (upper == "END" && blockDepth > 0) { blockDepth--; }
                word.Clear();
            }
            if (c == ';' && blockDepth == 0)
            {
                buf.Append(c);
                var s = buf.ToString().Trim();
                if (s.Length > 0) { outList.Add(s); }
                buf.Clear();
                continue;
            }
            buf.Append(c);
        }
        var tail = buf.ToString().Trim();
        if (tail.Length > 0) { outList.Add(tail); }
        return outList;
    }

    private static bool TryParse(string[] args, out string provider, out string migratePath, out string? connection, out bool one, out bool showHelp, out string error)
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
        if (string.IsNullOrEmpty(connection))
        {
            connection = ConnectionEnv.For(provider);
        }
        if (string.IsNullOrEmpty(connection))
        {
            error = $"missing --connection — pass --connection <url> (e.g. ./app.sqlite for sqlite) or set one of: {string.Join(", ", ConnectionEnv.VarsFor(provider))}. Run with --help for examples.";
            return false;
        }
        return true;
    }
}
