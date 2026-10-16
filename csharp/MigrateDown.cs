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
            var name = await new Migrater(dialect).Down(new DownArg(connection, migratePath)).ConfigureAwait(false);
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
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--confirm", out var takenConfirm))
            {
                confirm = takenConfirm;
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
