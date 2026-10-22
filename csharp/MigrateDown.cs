// Rolls back the most recently applied migration (one step). DESTRUCTIVE: refuses to proceed unless the operator types confirm on stdin, or passes --confirm.

namespace Deterministic.MigrateRunner;

internal sealed class MigrateDown(IProviderFactory providers, IConnectionResolver connections)
    : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("down");

    public string Name => "down";

    public async Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var migratePath, out var connection, out var confirm, out var showHelp, out var error))
            return showHelp ? WriteHelp() : Fail(error);

        var resolved = MigrateCli.ResolveProvider(providers, connections, provider, connection);
        if (resolved is not ProviderResolution.Ready(var loaded, var resolvedConnection))
            return Fail(((ProviderResolution.Rejected)resolved).Error);

        if (!ConfirmOrAbort(loaded.Name, confirm))
            return 2;

        try
        {
            var name = await new Migrater(loaded).Down(new DownArg(resolvedConnection, migratePath)).ConfigureAwait(false);
            Console.WriteLine(
                name is null
                    ? HelpTemplates.Message("status/no-rollback")
                    : HelpTemplates.Message("status/rolled-back", new Dictionary<string, string> { ["name"] = name })
            );
            return 0;
        }
        catch (Exception ex)
        {
            return Fail($"migrate-down failed: {ex.Message}", 1);
        }
    }

    private static bool ConfirmOrAbort(string dialect, bool confirm)
    {
        Console.Error.Write(
            HelpTemplates.Message(
                "down/destructive-header",
                new Dictionary<string, string> { ["dialect"] = dialect }
            )
        );
        if (confirm)
            return true;
        if (Console.IsInputRedirected)
        {
            Console.Error.WriteLine(HelpTemplates.Message("down/confirm-tty-required"));
            return false;
        }
        Console.Error.Write(HelpTemplates.Message("down/confirm-prompt"));
        Console.Error.Flush();
        var line = Console.In.ReadLine()?.Trim();
        if (line == "confirm")
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
        out bool confirm,
        out bool showHelp,
        out string error
    )
    {
        provider = string.Empty;
        migratePath = string.Empty;
        connection = null;
        confirm = false;
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
            if (a == "--confirm")
            {
                confirm = true;
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
