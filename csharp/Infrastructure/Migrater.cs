namespace Deterministic.MigrateRunner;

internal sealed class Migrater(ISqlDialect dialect) : IMigrater
{
    public string Name => dialect.Name;

    public async Task Setup(SetupArg args)
    {
        dialect.PrepareSetup(args.Connection);
        await using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(args.Connection));
        await conn.OpenAsync().ConfigureAwait(false);
        await DbExecute.NonQueryAsync(conn, null, dialect.MigratesDdl).ConfigureAwait(false);
        await DbExecute.NonQueryAsync(conn, null, dialect.MigrateLogsDdl).ConfigureAwait(false);
        Directory.CreateDirectory(args.MigrationsPath);
    }

    public async Task<IReadOnlyList<string>> Up(UpArg args)
    {
        await using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(args.Connection));
        await conn.OpenAsync().ConfigureAwait(false);

        var files = Migrations.OrderedUpFiles(args.MigrationsPath);
        var applied = await Migrations.AppliedChecksumsAsync(conn, dialect.SelectAppliedChecksumSql).ConfigureAwait(false);
        Migrations.AssertNoChecksumDrift(files, applied);
        var names = new List<string>();
        while (true)
        {
            var next = files.FirstOrDefault(f => !applied.ContainsKey(f.Name));
            if (next is null)
                return names;

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

            applied[next.Name] = checksum;
            names.Add(next.Name);
            if (args.One)
                return names;
        }
    }

    public async Task<string?> Down(DownArg args)
    {
        await using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(args.Connection));
        await conn.OpenAsync().ConfigureAwait(false);

        var files = Migrations.OrderedUpFiles(args.MigrationsPath);
        var applied = await Migrations.AppliedChecksumsAsync(conn, dialect.SelectAppliedChecksumSql).ConfigureAwait(false);
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
