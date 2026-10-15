// Rolls back the most recently applied migration (one step). DESTRUCTIVE: prints a random 4-letter uppercase token and refuses to proceed unless the operator types it back on stdin. Pass --confirm <TOKEN> matching the printed token to bypass the prompt (CI / scripted use).

namespace Deterministic.MigrateRunner;

internal sealed class MigrateDown(ISqlDialectFactory dialects, IConnectionResolver connections)
    : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("down");

    public string Name => "down";

    public async Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var migratePath, out var connection, out var confirm, out var showHelp, out var error))
            return showHelp ? WriteHelp() : Fail(error);

        if (!MigrateCli.TryResolveProvider(dialects, connections, provider, connection, out var dialect, out connection, out error))
            return Fail(error);

        if (dialect.PrerequisiteError(connection) is { } prerequisite)
            return Fail(prerequisite);

        var token = RandomToken();
        if (!ConfirmOrAbort(dialect.Name, token, confirm))
            return 2;

        try
        {
            return await RollbackLastAsync(dialect, migratePath, connection).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return Fail($"migrate-down failed: {ex.Message}", 1);
        }
    }

    private static async Task<int> RollbackLastAsync(
        ISqlDialect dialect,
        string migratePath,
        string connection
    )
    {
        await using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(connection));
        await conn.OpenAsync().ConfigureAwait(false);

        var files = Migrations.OrderedUpFiles(migratePath);
        var applied = await Migrations.AppliedChecksumsAsync(conn, dialect.SelectAppliedChecksumSql).ConfigureAwait(false);
        if (applied.Count == 0)
        {
            Console.WriteLine(HelpTemplates.Message("status/no-rollback"));
            return 0;
        }
        Migrations.AssertNoChecksumDrift(files, applied);
        var last = files.LastOrDefault(f => applied.ContainsKey(f.Name));
        if (last is null)
            throw new InvalidOperationException(HelpTemplates.Message("errors/rollback-not-in-path"));

        var path =
            Migrations.DownPathFor(migratePath, last.Name)
            ?? throw new FileNotFoundException(
                HelpTemplates.Message(
                    "errors/rollback-no-down-sibling",
                    new Dictionary<string, string> { ["name"] = last.Name }
                )
            );
        var sql = await File.ReadAllTextAsync(path).ConfigureAwait(false);
        var logId = await MigrateLog.InsertStartedAsync(conn, dialect, last.Name, "down").ConfigureAwait(false);
        var started = DateTime.UtcNow;
        try
        {
            await DbExecute
                .ApplyStatementsAsync(
                    conn,
                    dialect,
                    sql,
                    tx =>
                        DbExecute.CatalogWriteAsync(
                            conn,
                            tx,
                            dialect,
                            dialect.DeleteAppliedSql,
                            ("p1", last.Name)
                        )
                )
                .ConfigureAwait(false);
            await MigrateLog
                .UpdateAsync(conn, dialect, logId, "success", (long)(DateTime.UtcNow - started).TotalMilliseconds, null)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            await MigrateLog
                .UpdateAsync(conn, dialect, logId, "error", (long)(DateTime.UtcNow - started).TotalMilliseconds, ex.Message)
                .ConfigureAwait(false);
            throw;
        }

        Console.WriteLine(
            HelpTemplates.Message("status/rolled-back", new Dictionary<string, string> { ["name"] = last.Name })
        );
        return 0;
    }

    private static string RandomToken()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        var buf = new byte[4];
        System.Security.Cryptography.RandomNumberGenerator.Fill(buf);
        return string.Concat(buf.Select(b => alphabet[b % alphabet.Length]));
    }

    private static bool ConfirmOrAbort(string dialect, string token, string? supplied)
    {
        Console.Error.Write(
            HelpTemplates.Message(
                "down/destructive-header",
                new Dictionary<string, string> { ["dialect"] = dialect, ["token"] = token }
            )
        );
        if (supplied is not null)
        {
            if (supplied == token)
                return true;
            Console.Error.WriteLine(
                HelpTemplates.Message(
                    "down/confirm-mismatch",
                    new Dictionary<string, string> { ["supplied"] = supplied, ["token"] = token }
                )
            );
            return false;
        }
        if (Console.IsInputRedirected)
        {
            Console.Error.WriteLine(
                HelpTemplates.Message("down/confirm-tty-required", new Dictionary<string, string> { ["token"] = token })
            );
            return false;
        }
        Console.Error.Write(
            HelpTemplates.Message("down/confirm-prompt", new Dictionary<string, string> { ["token"] = token })
        );
        Console.Error.Flush();
        var line = Console.In.ReadLine()?.Trim();
        if (line == token)
            return true;
        Console.Error.WriteLine(
            line is null
                ? HelpTemplates.Message("down/confirm-stdin-failed")
                : HelpTemplates.Message("down/confirm-token-mismatch")
        );
        return false;
    }

    private bool TryParse(
        string[] args,
        out string provider,
        out string migratePath,
        out string? connection,
        out string? confirm,
        out bool showHelp,
        out string error
    )
    {
        provider = string.Empty;
        migratePath = string.Empty;
        connection = null;
        confirm = null;
        showHelp = false;
        error = string.Empty;
        string? migrateRoot = null;

        for (var i = 0; i < args.Length; i++)
        {
            var a = args[i];
            if (a is "-h" or "--help")
            {
                showHelp = true;
                return false;
            }
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--provider", out provider))
                continue;
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--connection", out var c))
            {
                connection = c;
                continue;
            }
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--confirm", out confirm))
                continue;
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--migrations-path", out migratePath)
                || MigrateCli.TryTakeFlag(args, ref i, a, "--migrate-path", out migratePath))
                continue;
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--migrations-root", out migrateRoot)
                || MigrateCli.TryTakeFlag(args, ref i, a, "--migrate-root", out migrateRoot))
                continue;

            error = MigrateCli.ParseArgError(
                a,
                a.StartsWith("--", StringComparison.Ordinal) && i + 1 >= args.Length
            );
            return false;
        }

        if (string.IsNullOrEmpty(provider))
            return MigrateCli.MissingValue("--provider", out error);
        migratePath = MigrateCli.MigratePath(provider, migratePath, migrateRoot);
        return true;
    }

    private static int WriteHelp()
    {
        Console.Error.Write(HelpText);
        return 0;
    }

    private static int Fail(string error, int code = 2)
    {
        Console.Error.WriteLine(error);
        if (code == 2)
            Console.Error.Write(HelpText);
        return code;
    }
}
