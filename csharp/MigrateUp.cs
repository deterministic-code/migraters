// Default: applies ALL pending migrations in sequence, each in its own transaction. Pass --one to apply only the next pending migration (legacy one-shot behavior; useful when wrapping in an external loop or when you want to inspect state between steps).

namespace Deterministic.MigrateRunner;

internal sealed class MigrateUp(IDialectFactory dialects, IConnectionResolver connections)
    : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("up");

    public string Name => "up";

    public async Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var migratePath, out var connection, out var one, out var showHelp, out var error))
            return showHelp ? WriteHelp() : Fail(error);

        var resolved = MigrateCli.ResolveProvider(dialects, connections, provider, connection);
        if (resolved is not ProviderResolution.Ready(var dialect, var resolvedConnection))
            return Fail(((ProviderResolution.Rejected)resolved).Error);

        if (dialect.PrerequisiteError(resolvedConnection) is { } prerequisite)
            return Fail(prerequisite);

        try
        {
            var names = await new Migrater(dialect).Up(new UpArg(resolvedConnection, migratePath, one)).ConfigureAwait(false);
            if (names.Count == 0)
                Console.WriteLine(HelpTemplates.Message("status/no-pending"));
            else
            {
                foreach (var name in names)
                    Console.WriteLine(
                        HelpTemplates.Message("status/applied", new Dictionary<string, string> { ["name"] = name })
                    );
                if (!one)
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
