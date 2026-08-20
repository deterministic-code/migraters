// Scaffolds a new <NNNN>_<name>_{up,down}.sql pair in the migrations directory. Numbering is max(1-4-digit prefix in dir)+1; legacy timestamp prefixes are ignored.

namespace Deterministic.MigrateRunner;

internal sealed class MigrateCreate(ISqlDialectFactory dialects) : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("create");
    private static readonly Regex NameRe = new("^[a-z][a-z0-9_]*$", RegexOptions.Compiled);
    private static readonly Regex SeqRe = new(@"^(\d{1,4})_.*_up\.sql$", RegexOptions.Compiled);

    public string Name => "create";

    public Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var name, out var migrationsPath, out var showHelp, out var error))
            return Task.FromResult(showHelp ? WriteHelp() : Fail(error));

        if (!dialects.TryGet(provider, out var dialect))
            return Task.FromResult(
                Fail(
                    HelpTemplates.Message(
                        "errors/unsupported-provider",
                        new Dictionary<string, string> { ["provider"] = provider }
                    )
                )
            );

        var dir = migrationsPath ?? $"./sql/{dialect.Name}/migrations";
        try
        {
            Directory.CreateDirectory(dir);
            var prefix = NextSequence(dir).ToString("D4", CultureInfo.InvariantCulture);
            var upName = $"{prefix}_{name}_up.sql";
            var downName = $"{prefix}_{name}_down.sql";
            File.WriteAllText(
                Path.Combine(dir, upName),
                HelpTemplates.Scaffold("up", new Dictionary<string, string> { ["name"] = name })
            );
            File.WriteAllText(
                Path.Combine(dir, downName),
                HelpTemplates.Scaffold("down", new Dictionary<string, string> { ["name"] = name })
            );
            Console.WriteLine(
                HelpTemplates.Message("status/created", new Dictionary<string, string> { ["file"] = upName })
            );
            Console.WriteLine(
                HelpTemplates.Message("status/created", new Dictionary<string, string> { ["file"] = downName })
            );
            return Task.FromResult(0);
        }
        catch (Exception ex)
        {
            return Task.FromResult(Fail($"migrate-create failed: {ex.Message}", 1));
        }
    }

    private static int NextSequence(string dir) =>
        !Directory.Exists(dir)
            ? 1
            : Directory
                .EnumerateFiles(dir)
                .Select(Path.GetFileName)
                .Where(f => f is not null)
                .Select(f => SeqRe.Match(f!))
                .Where(m => m.Success)
                .Select(m => int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture))
                .DefaultIfEmpty(0)
                .Max()
            + 1;

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
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--provider", out provider))
                continue;
            if (MigrateCli.TryTakeFlag(args, ref i, a, "--name", out name))
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

        if (string.IsNullOrEmpty(provider))
            return MigrateCli.MissingValue("--provider", out error);
        if (string.IsNullOrEmpty(name))
            return MigrateCli.MissingValue("--name", out error);
        if (!NameRe.IsMatch(name))
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
