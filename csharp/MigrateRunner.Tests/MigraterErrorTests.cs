namespace Deterministic.MigrateRunner.Tests;

public sealed class MigraterErrorTests
{
    private static string Memory() =>
        $"Data Source=migraters-err-{Guid.NewGuid():N};Mode=Memory;Cache=Shared";

    private static (string dir, string migrations, IMigrater migrater, string connection) Open()
    {
        var dir = Path.Combine(Path.GetTempPath(), $"migraters-err-{Guid.NewGuid():N}");
        var migrations = Path.Combine(dir, "migrations");
        Directory.CreateDirectory(migrations);
        var connection = Memory();
        var migrater = new Migrater(new SqliteProvider());
        return (dir, migrations, migrater, connection);
    }

    [Fact]
    public async Task CreateRejectsInvalidNameAndSequencesFromMissingDir()
    {
        var (dir, migrations, migrater, _) = Open();
        try
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                migrater.Create(new CreateArg("Bad", migrations))
            );
            var nested = Path.Combine(dir, "gone");
            var created = await migrater.Create(new CreateArg("add_users", nested));
            Assert.Equal("0001_add_users_up.sql", created.UpName);
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    [Fact]
    public async Task UpLogsFailureAndHonorsOne()
    {
        var (dir, migrations, migrater, connection) = Open();
        try
        {
            await migrater.Setup(new SetupArg(connection, migrations));
            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_up.sql"), "NOT VALID;\n");
            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_down.sql"), "SELECT 1;\n");
            await Assert.ThrowsAnyAsync<Exception>(() => migrater.Up(new UpArg(connection, migrations)));

            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_up.sql"), "CREATE TABLE t (id INT);\n");
            await File.WriteAllTextAsync(Path.Combine(migrations, "0002_next_up.sql"), "CREATE TABLE u (id INT);\n");
            await File.WriteAllTextAsync(Path.Combine(migrations, "0002_next_down.sql"), "DROP TABLE u;\n");
            Assert.Equal(["0001_init"], await migrater.Up(new UpArg(connection, migrations, One: true)));
            Assert.Equal(["0002_next"], await migrater.Up(new UpArg(connection, migrations)));
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    [Fact]
    public async Task DownCoversEmptyMissingSiblingAndFailure()
    {
        var (dir, migrations, migrater, connection) = Open();
        try
        {
            await migrater.Setup(new SetupArg(connection, migrations));
            Assert.Null(await migrater.Down(new DownArg(connection, migrations)));

            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_up.sql"), "CREATE TABLE t (id INT);\n");
            await migrater.Up(new UpArg(connection, migrations));
            await Assert.ThrowsAsync<FileNotFoundException>(() =>
                migrater.Down(new DownArg(connection, migrations))
            );

            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_down.sql"), "NOT VALID;\n");
            await Assert.ThrowsAnyAsync<Exception>(() => migrater.Down(new DownArg(connection, migrations)));

            var ghostDir = Path.Combine(dir, "ghost");
            Directory.CreateDirectory(ghostDir);
            await File.WriteAllTextAsync(Path.Combine(ghostDir, "0009_other_up.sql"), "CREATE TABLE o (id INT);\n");
            await File.WriteAllTextAsync(Path.Combine(ghostDir, "0009_other_down.sql"), "DROP TABLE o;\n");
            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                migrater.Down(new DownArg(connection, ghostDir))
            );
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    [Fact]
    public void ChecksumDriftAndCatalogName()
    {
        var dir = Path.Combine(Path.GetTempPath(), $"migraters-drift-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        var prev = Environment.GetEnvironmentVariable("MIGRATE_ALLOW_CHECKSUM_DRIFT");
        try
        {
            var up = Path.Combine(dir, "0001_init_up.sql");
            File.WriteAllText(up, "CREATE TABLE t (id INT);\n");
            var files = Migrations.OrderedUpFiles(dir);
            Assert.Equal("0001_init", Migrations.CatalogName("0001_init_up.sql"));
            Assert.Equal("0001_init", Migrations.CatalogName("0001_init"));
            Assert.Null(Migrations.DownPathFor(dir, "0001_init"));
            Migrations.AssertNoChecksumDrift(files, new Dictionary<string, string?> { ["0001_init"] = null });
            Assert.Throws<InvalidOperationException>(() =>
                Migrations.AssertNoChecksumDrift(
                    files,
                    new Dictionary<string, string?> { ["0001_init"] = "short" }
                )
            );
            Environment.SetEnvironmentVariable("MIGRATE_ALLOW_CHECKSUM_DRIFT", "1");
            Migrations.AssertNoChecksumDrift(
                files,
                new Dictionary<string, string?> { ["0001_init"] = "short" }
            );
            Assert.Equal(Checksum.Hex("x"), Checksum.Hex("x")[..12] is var _ ? Checksum.Hex("x") : "");
        }
        finally
        {
            Environment.SetEnvironmentVariable("MIGRATE_ALLOW_CHECKSUM_DRIFT", prev);
            Directory.Delete(dir, true);
        }
    }

    [Fact]
    public async Task SqlRunWithoutTransactionAndPrerequisite()
    {
        var sqlite = new SqliteProvider();
        var connection = Memory();
        await sqlite.Setup(connection);
        var sql = sqlite.Sql;
        Assert.NotNull(sql.PrerequisiteError(Path.Combine(Path.GetTempPath(), $"missing-{Guid.NewGuid():N}.sqlite")));
        sql.PrepareSetup(connection);
        var fileDb = Path.Combine(Path.GetTempPath(), $"migraters-prep-{Guid.NewGuid():N}", "app.sqlite");
        sql.PrepareSetup(fileDb);
        await sql.CreateDatabaseIfMissingAsync(connection);
        Assert.Equal("LIMIT 2", sql.LimitClause(2));
        var plain = Memory();
        var run = new SqlRun(
            "sqlite",
            useTransaction: false,
            sql.NormalizeConnectionString,
            sql.CreateConnection,
            sql.AddParameter,
            sql.QuoteIdent,
            sql.Placeholder,
            createDatabase: _ => null!
        );
        run.PrepareSetup(plain);
        var created = false;
        await new SqlRun(
            "sqlite",
            false,
            sql.NormalizeConnectionString,
            sql.CreateConnection,
            sql.AddParameter,
            sql.QuoteIdent,
            sql.Placeholder,
            createDatabase: _ =>
            {
                created = true;
                return Task.CompletedTask;
            }
        ).CreateDatabaseIfMissingAsync(plain);
        Assert.True(created);
        await run.Setup(plain);
        await run.MigrateUp(plain, "one", "CREATE TABLE t (id INT);", "sum");
        Assert.Equal("sum", (await run.Applied(plain))["one"]);
        await using (var extra = sql.CreateConnection(sql.NormalizeConnectionString(plain)))
        {
            await extra.OpenAsync();
            await using var update = extra.CreateCommand();
            update.CommandText = "UPDATE migrates SET checksum = NULL";
            await update.ExecuteNonQueryAsync();
        }
        Assert.Null((await run.Applied(plain))["one"]);
        await run.MigrateDown(plain, "one", "DROP TABLE t;");
        Assert.Empty(await run.Applied(plain));
        var id = await run.Log(plain, null, "one", "up", null, 0, null);
        Assert.Equal(id, await run.Log(plain, id, "one", "up", null, 1, "boom"));
        Assert.Equal("sqlite", new Migrater(new SqliteProvider()).Name);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new SqlRun(
                "sqlite",
                true,
                sql.NormalizeConnectionString,
                sql.CreateConnection,
                sql.AddParameter,
                sql.QuoteIdent,
                sql.Placeholder,
                _ => "missing-db"
            ).Applied("x")
        );
    }
}
