// Scaffolds a new <NNNN>_<name>_{up,down}.sql pair in the migrations directory. Numbering is max(1-4-digit prefix in dir)+1; legacy timestamp prefixes are ignored.

namespace Deterministic.MigrateRunner;

internal sealed class MigrateCreate(ISqlDialectFactory dialects) : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("create");

    public string Name => "create";

    public async Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var name, out var migrationsPath, out var showHelp, out var error))
            return showHelp ? WriteHelp() : Fail(error);

        if (!dialects.TryGet(provider, out var dialect))
            return Fail(
                HelpTemplates.Message(
                    "errors/unsupported-provider",
                    new Dictionary<string, string> { ["provider"] = provider }
                )
            );

        var dir = migrationsPath ?? $"./sql/{dialect.Name}/migrations";
        try
        {
            var created = await new Migrater(dialect).Create(new CreateArg(name, dir)).ConfigureAwait(false);
            Console.WriteLine(
                HelpTemplates.Message("status/created", new Dictionary<string, string> { ["file"] = created.UpName })
            );
            Console.WriteLine(
                HelpTemplates.Message("status/created", new Dictionary<string, string> { ["file"] = created.DownName })
            );
            return 0;
        }
        catch (Exception ex)
        {
            return Fail($"migrate-create failed: {ex.Message}", 1);
        }
    }

    private static bool TryParse(
        string[] args,
        out string provider,
        out string name,
        out string? migrationsPath,
        out bool showHelp,
        out string error
    )
    {
        provider = string.Empty;
        name = string.Empty;
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
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--provider", out var takenProvider))
            {
                provider = takenProvider;
                continue;
            }
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--name", out var takenName))
            {
                name = takenName;
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

        if (string.IsNullOrEmpty(provider))
            return MigrateCli.MissingProvider(out error);
        if (string.IsNullOrEmpty(name))
            return MigrateCli.MissingName(out error);
        if (!Migrations.IsMigrationName(name))
        {
            error = HelpTemplates.Message(
                "errors/invalid-name",
                new Dictionary<string, string> { ["name"] = name }
            );
            return false;
        }
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
