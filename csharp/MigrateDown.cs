// Rolls back the most recently applied migration (one step). DESTRUCTIVE: prints a random 4-letter uppercase token and refuses to proceed unless the operator types it back on stdin. Pass --confirm <TOKEN> matching the printed token to bypass the prompt (CI / scripted use).

using System.Data.Common;
using System.Text;

namespace Deterministic.MigrateRunner;

internal sealed class MigrateDown : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("down");

    private readonly ISqlDialectFactory _dialects;
    private readonly IConnectionResolver _connections;

    public MigrateDown(ISqlDialectFactory dialects, IConnectionResolver connections)
    {
        _dialects = dialects;
        _connections = connections;
    }

    public string Name => "down";

    public async Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var migratePath, out var connection, out var confirm, out var showHelp, out var error))
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

        var token = RandomToken();
        if (!ConfirmOrAbort(token, confirm))
        {
            return 2;
        }

        try
        {
            return await RollbackLastAsync(dialect, migratePath, connection!).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"migrate-down failed: {ex.Message}");
            return 1;
        }
    }

    private static async Task<int> RollbackLastAsync(ISqlDialect dialect, string migratePath, string connection)
    {
        await using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(connection));
        await conn.OpenAsync().ConfigureAwait(false);

        var name = await LoadLastAppliedAsync(conn, dialect.SelectLastAppliedNameSql).ConfigureAwait(false);
        if (name is null)
        {
            Console.WriteLine("No applied migrations to roll back.");
            return 0;
        }
        var path = FindDownFile(migratePath, name)
            ?? throw new FileNotFoundException($"Cannot roll back \"{name}\": no <stem>_down.sql sibling found");
        var sql = await File.ReadAllTextAsync(path).ConfigureAwait(false);

        await DbExecute.ApplyStatementsAsync(conn, dialect, sql, tx =>
            DbExecute.CatalogWriteAsync(
                conn,
                tx,
                dialect,
                dialect.DeleteAppliedSql,
                ("p1", name))).ConfigureAwait(false);

        Console.WriteLine($"Rolled back: {name}");
        return 0;
    }

    private static async Task<string?> LoadLastAppliedAsync(DbConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        using var reader = await cmd.ExecuteReaderAsync().ConfigureAwait(false);
        if (!await reader.ReadAsync().ConfigureAwait(false)) return null;
        return reader.GetString(0);
    }

    private static string? FindDownFile(string migratePath, string upName)
    {
        if (!Directory.Exists(migratePath)) return null;
        // upName is the `migrates.name` row (typically `<stem>_up.sql`); the expected sibling is `<stem>_down.sql`.
        if (!upName.EndsWith("_up.sql", StringComparison.Ordinal)) return null;
        var stem = upName.Substring(0, upName.Length - "_up.sql".Length);
        var candidate = Path.Combine(migratePath, $"{stem}_down.sql");
        return File.Exists(candidate) ? candidate : null;
    }

    // Friction gate, not crypto. Adequate to prevent muscle-memory rollback flows; CI uses --confirm.
    private static string RandomToken()
    {
        const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // omit I, O — visually ambiguous
        var buf = new byte[4];
        System.Security.Cryptography.RandomNumberGenerator.Fill(buf);
        var sb = new StringBuilder(4);
        foreach (var b in buf)
        {
            sb.Append(Alphabet[b % Alphabet.Length]);
        }
        return sb.ToString();
    }

    private static bool ConfirmOrAbort(string token, string? supplied)
    {
        Console.Error.WriteLine();
        Console.Error.WriteLine("⚠ DESTRUCTIVE: this rolls back the most recently applied migration.");
        Console.Error.WriteLine($"  Confirmation token: {token}");
        Console.Error.WriteLine();
        if (supplied is not null)
        {
            if (supplied == token) return true;
            Console.Error.WriteLine($"--confirm value ({supplied}) does not match the token printed above ({token}). Aborting.");
            return false;
        }
        if (Console.IsInputRedirected)
        {
            Console.Error.WriteLine($"migrate-down requires interactive confirmation when stdin is not a TTY — pass --confirm {token} (this exact token, printed above) to proceed.");
            return false;
        }
        Console.Error.Write($"Type {token} to confirm rollback: ");
        Console.Error.Flush();
        var line = Console.In.ReadLine();
        if (line is null)
        {
            Console.Error.WriteLine("failed to read confirmation from stdin — aborting.");
            return false;
        }
        if (line.Trim() == token) return true;
        Console.Error.WriteLine("Confirmation token did not match — aborting.");
        return false;
    }

    private bool TryParse(string[] args, out string provider, out string migratePath, out string? connection, out string? confirm, out bool showHelp, out string error)
    {
        provider = string.Empty;
        migratePath = string.Empty;
        var migrateRoot = (string?)null;
        connection = null;
        confirm = null;
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
                case "--confirm":
                    if (i + 1 >= args.Length) { error = "missing value for --confirm"; return false; }
                    confirm = args[++i];
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
