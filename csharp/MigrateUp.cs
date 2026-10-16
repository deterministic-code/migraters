// Default: applies ALL pending migrations in sequence, each in its own transaction. Pass --one to apply only the next pending migration (legacy one-shot behavior; useful when wrapping in an external loop or when you want to inspect state between steps).

namespace Deterministic.MigrateRunner;

internal sealed class MigrateUp(ISqlDialectFactory dialects, IConnectionResolver connections)
    : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("up");

    public string Name => "up";

    public async Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var migratePath, out var connection, out var one, out var showHelp, out var error))
            return showHelp ? WriteHelp() : Fail(error);

        if (!MigrateCli.TryResolveProvider(dialects, connections, provider, connection, out var dialect, out connection, out error))
            return Fail(error);

        if (dialect.PrerequisiteError(connection) is { } prerequisite)
            return Fail(prerequisite);

        try
        {
            return await ApplyPendingAsync(dialect, migratePath, connection, one).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return Fail($"migrate-up failed: {ex.Message}", 1);
        }
    }

    private static async Task<int> ApplyPendingAsync(
        ISqlDialect dialect,
        string migratePath,
        string connection,
        bool one
    )
    {
        await using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(connection));
        await conn.OpenAsync().ConfigureAwait(false);

        var files = Migrations.OrderedUpFiles(migratePath);
        var applied = await Migrations.AppliedChecksumsAsync(conn, dialect.SelectAppliedChecksumSql).ConfigureAwait(false);
        Migrations.AssertNoChecksumDrift(files, applied);
        var appliedCount = 0;
        while (true)
        {
            var next = files.FirstOrDefault(f => !applied.ContainsKey(f.Name));
            if (next is null)
            {
                Console.WriteLine(
                    appliedCount == 0
                        ? HelpTemplates.Message("status/no-pending")
                        : HelpTemplates.Message("status/no-more-pending")
                );
                return 0;
            }

            var sql = await File.ReadAllTextAsync(next.UpPath).ConfigureAwait(false);
            var checksum = Checksum.Hex(sql);
            var logId = await MigrateLog.InsertStartedAsync(conn, dialect, next.Name, "up").ConfigureAwait(false);
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
                                dialect.InsertAppliedSql,
                                ("p1", next.Name),
                                ("p2", checksum)
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
                HelpTemplates.Message("status/applied", new Dictionary<string, string> { ["name"] = next.Name })
            );
            applied[next.Name] = checksum;
            appliedCount++;
            if (one)
                return 0;
        }
    }

    private bool TryParse(
        string[] args,
        out string provider,
        out string migratePath,
        out string? connection,
        out bool one,
        out bool showHelp,
        out string error
    )
    {
        provider = string.Empty;
        migratePath = string.Empty;
        connection = null;
        one = false;
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
            if (a == "--one")
            {
                one = true;
                continue;
            }
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--provider", out var takenProvider))
            {
                provider = takenProvider;
                continue;
            }
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--connection", out var c))
            {
                connection = c;
                continue;
            }
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--migrations-path", out var takenPath)
                || MigrateCli.TryTakeFlag(args, ref i, a, "--migrate-path", out takenPath))
            {
                migratePath = takenPath;
                continue;
            }
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--migrations-root", out var takenRoot)
                || MigrateCli.TryTakeFlag(args, ref i, a, "--migrate-root", out takenRoot))
            {
                migrateRoot = takenRoot;
                continue;
            }

            error = MigrateCli.ParseArgError(a, MigrateCli.IsValueFlag(a) && i + 1 >= args.Length);
            return false;
        }

        if (string.IsNullOrEmpty(provider))
            return MigrateCli.MissingProvider(out error);
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
