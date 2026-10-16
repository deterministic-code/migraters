// Idempotent CREATE TABLE IF NOT EXISTS migrates+migrate_logs via IMigrater.Setup.

namespace Deterministic.MigrateRunner;

internal sealed class MigrateSetup(ISqlDialectFactory dialects, IConnectionResolver connections)
    : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("setup");

    public string Name => "setup";

    public async Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var connection, out var migrationsPath, out var andUp, out var showHelp, out var error))
            return showHelp ? WriteHelp() : Fail(error);

        if (!MigrateCli.TryResolveProvider(dialects, connections, provider, connection, out var dialect, out connection, out error))
            return Fail(error);

        var resolvedMigrationsPath = migrationsPath ?? $"./sql/{dialect.Name}/migrations";
        var migrater = new Migrater(dialect);

        try
        {
            await migrater.Setup(new SetupArg(connection, resolvedMigrationsPath)).ConfigureAwait(false);
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
        if (!andUp)
            return 0;
        try
        {
            var names = await migrater.Up(new UpArg(connection, resolvedMigrationsPath)).ConfigureAwait(false);
            if (names.Count == 0)
                Console.WriteLine(HelpTemplates.Message("status/no-pending"));
            else
            {
                foreach (var name in names)
                    Console.WriteLine(
                        HelpTemplates.Message("status/applied", new Dictionary<string, string> { ["name"] = name })
                    );
                Console.WriteLine(HelpTemplates.Message("status/no-more-pending"));
            }
            return 0;
        }
        catch (Exception ex)
        {
            return Fail($"migrate-up failed: {ex.Message}", 1);
        }
    }

    private bool TryParse(
        string[] args,
        out string provider,
        out string? connection,
        out string? migrationsPath,
        out bool andUp,
        out bool showHelp,
        out string error
    )
    {
        provider = string.Empty;
        connection = null;
        migrationsPath = null;
        andUp = false;
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
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--provider", out var takenProvider))
            {
                provider = takenProvider;
                continue;
            }
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--connection", out var takenConnection))
            {
                connection = takenConnection;
                continue;
            }
            if (a == "--and-up")
            {
                andUp = true;
                continue;
            }
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--migrations-path", out var takenPath)
                || MigrateCli.TryTakeFlag(args, ref i, a, "--migrate-path", out takenPath))
            {
                migrationsPath = takenPath;
                continue;
            }

            error = MigrateCli.ParseArgError(a, MigrateCli.IsValueFlag(a) && i + 1 >= args.Length);
            return false;
        }

        return !string.IsNullOrEmpty(provider) || MigrateCli.MissingProvider(out error);
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
