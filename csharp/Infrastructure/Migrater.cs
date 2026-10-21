namespace Deterministic.MigrateRunner;

internal sealed class Migrater(IDialect dialect) : IMigrater
{
    public string Name => dialect.Name;

    public async Task Setup(SetupArg args)
    {
        dialect.PrepareSetup(args.Connection);
        await using var driver = await dialect.OpenAsync(args.Connection).ConfigureAwait(false);
        await driver.Setup().ConfigureAwait(false);
        Directory.CreateDirectory(args.MigrationsPath);
    }

    public async Task<IReadOnlyList<string>> Up(UpArg args)
    {
        await using var driver = await dialect.OpenAsync(args.Connection).ConfigureAwait(false);

        var files = Migrations.OrderedUpFiles(args.MigrationsPath);
        var applied = new Dictionary<string, string?>(
            await driver.Applied().ConfigureAwait(false),
            StringComparer.Ordinal
        );
        Migrations.AssertNoChecksumDrift(files, applied);
        var names = new List<string>();
        while (true)
        {
            var next = files.FirstOrDefault(f => !applied.ContainsKey(f.Name));
            if (next is null)
                return names;

            var sql = await File.ReadAllTextAsync(next.UpPath).ConfigureAwait(false);
            var checksum = Checksum.Hex(sql);
            var logId = await driver.LogStarted(next.Name, "up").ConfigureAwait(false);
            var started = DateTime.UtcNow;
            try
            {
                await driver.MigrateUp(next.Name, sql, checksum).ConfigureAwait(false);
                await driver
                    .LogFinished(logId, "success", (long)(DateTime.UtcNow - started).TotalMilliseconds, null)
                    .ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                await driver
                    .LogFinished(logId, "error", (long)(DateTime.UtcNow - started).TotalMilliseconds, ex.Message)
                    .ConfigureAwait(false);
                throw;
            }

            applied[next.Name] = checksum;
            names.Add(next.Name);
            if (args.One)
                return names;
        }
    }

    public async Task<string?> Down(DownArg args)
    {
        await using var driver = await dialect.OpenAsync(args.Connection).ConfigureAwait(false);

        var files = Migrations.OrderedUpFiles(args.MigrationsPath);
        var applied = await driver.Applied().ConfigureAwait(false);
        if (applied.Count == 0)
            return null;
        Migrations.AssertNoChecksumDrift(files, applied);
        var last = files.LastOrDefault(f => applied.ContainsKey(f.Name));
        if (last is null)
            throw new InvalidOperationException(HelpTemplates.Message("errors/rollback-not-in-path"));

        var path =
            Migrations.DownPathFor(args.MigrationsPath, last.Name)
            ?? throw new FileNotFoundException(
                HelpTemplates.Message(
                    "errors/rollback-no-down-sibling",
                    new Dictionary<string, string> { ["name"] = last.Name }
                )
            );
        var sql = await File.ReadAllTextAsync(path).ConfigureAwait(false);
        var logId = await driver.LogStarted(last.Name, "down").ConfigureAwait(false);
        var started = DateTime.UtcNow;
        try
        {
            await driver.MigrateDown(last.Name, sql).ConfigureAwait(false);
            await driver
                .LogFinished(logId, "success", (long)(DateTime.UtcNow - started).TotalMilliseconds, null)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            await driver
                .LogFinished(logId, "error", (long)(DateTime.UtcNow - started).TotalMilliseconds, ex.Message)
                .ConfigureAwait(false);
            throw;
        }

        return last.Name;
    }

    public Task<CreateResponse> Create(CreateArg args)
    {
        if (!Migrations.IsMigrationName(args.Name))
            throw new InvalidOperationException(
                HelpTemplates.Message("errors/invalid-name", new Dictionary<string, string> { ["name"] = args.Name })
            );
        Directory.CreateDirectory(args.MigrationsPath);
        var prefix = NextSequenceFromDir(args.MigrationsPath).ToString("D4", CultureInfo.InvariantCulture);
        var upName = $"{prefix}_{args.Name}_up.sql";
        var downName = $"{prefix}_{args.Name}_down.sql";
        File.WriteAllText(
            Path.Combine(args.MigrationsPath, upName),
            HelpTemplates.Scaffold("up", new Dictionary<string, string> { ["name"] = args.Name })
        );
        File.WriteAllText(
            Path.Combine(args.MigrationsPath, downName),
            HelpTemplates.Scaffold("down", new Dictionary<string, string> { ["name"] = args.Name })
        );
        return Task.FromResult(new CreateResponse(upName, downName));
    }

    private static int NextSequenceFromDir(string dir) =>
        !Directory.Exists(dir)
            ? 1
            : Migrations.NextSequence(
                Directory.EnumerateFiles(dir).Select(Path.GetFileName).OfType<string>()
            );
}
