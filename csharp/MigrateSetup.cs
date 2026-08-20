// Idempotent CREATE TABLE IF NOT EXISTS migrates+migrate_logs; DDL constants mirror scripts/lib/datasource-migrate.mjs:setupSql so the csharp + rust + ts runners share one migrates contract.

namespace Deterministic.MigrateRunner;

internal sealed class MigrateSetup(ISqlDialectFactory dialects, IConnectionResolver connections)
    : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("setup");

    public string Name => "setup";

    public async Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var connection, out var migrationsPath, out var showHelp, out var error))
            return showHelp ? WriteHelp() : Fail(error);

        if (!MigrateCli.TryResolveProvider(dialects, connections, provider, connection, out var dialect, out connection, out error))
            return Fail(error);

        var resolvedMigrationsPath = migrationsPath ?? $"./sql/{dialect.Name}/migrations";

        try
        {
            await using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(connection));
            await conn.OpenAsync().ConfigureAwait(false);
            await DbExecute.NonQueryAsync(conn, null, dialect.MigratesDdl).ConfigureAwait(false);
            await DbExecute.NonQueryAsync(conn, null, dialect.MigrateLogsDdl).ConfigureAwait(false);
            Directory.CreateDirectory(resolvedMigrationsPath);
        }
        catch (Exception ex)
        {
            return Fail($"setup failed: {ex.Message}", 1);
        }

        Console.Write(
            HelpTemplates.Message(
                "setup-complete",
                new Dictionary<string, string>
                {
                    ["dialect"] = dialect.Name,
                    ["migrationsPath"] = resolvedMigrationsPath,
                    ["createExample"] =
                        $"  migrate-create --provider {dialect.Name} --name add_users",
                    ["upExample"] =
                        $"  migrate-up --provider {dialect.Name} --connection {connection}",
                }
            )
        );
        return 0;
    }

    private bool TryParse(
        string[] args,
        out string provider,
        out string? connection,
        out string? migrationsPath,
        out bool showHelp,
        out string error
    )
    {
        provider = string.Empty;
        connection = null;
        migrationsPath = null;
        showHelp = false;
        error = string.Empty;

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
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--connection", out connection))
                continue;
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--migrations-path", out migrationsPath)
                || MigrateCli.TryTakeFlag(args, ref i, a, "--migrate-path", out migrationsPath))
                continue;

            error = MigrateCli.ParseArgError(
                a,
                a.StartsWith("--", StringComparison.Ordinal) && i + 1 >= args.Length
            );
            return false;
        }

        return !string.IsNullOrEmpty(provider) || MigrateCli.MissingValue("--provider", out error);
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
