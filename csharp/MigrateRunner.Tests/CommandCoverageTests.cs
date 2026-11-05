namespace Deterministic.MigrateRunner.Tests;

public sealed class CommandCoverageTests
{
    private static ServiceProvider Services() =>
        new ServiceCollection().AddMigrateRunner().BuildServiceProvider();

    private static T Command<T>()
        where T : IMigrateCommand =>
        Services().GetServices<IMigrateCommand>().OfType<T>().Single();

    private static string Memory() =>
        $"Data Source=migraters-cmd-{Guid.NewGuid():N};Mode=Memory;Cache=Shared";

    private static (string dir, string migrations) TempMigrations()
    {
        var dir = Path.Combine(Path.GetTempPath(), $"migraters-cmd-{Guid.NewGuid():N}");
        var migrations = Path.Combine(dir, "migrations");
        Directory.CreateDirectory(migrations);
        return (dir, migrations);
    }

    [Fact]
    public void RegistersEveryCommand()
    {
        var names = Services().GetServices<IMigrateCommand>().Select(c => c.Name).ToArray();
        Assert.Equal(["setup", "up", "down", "create"], names);
    }

    [Fact]
    public async Task SetupHelpAndMissingProvider()
    {
        var setup = Command<MigrateSetup>();
        Assert.Equal(0, await setup.RunAsync(["--help"]));
        Assert.Equal(2, await setup.RunAsync([]));
        Assert.Equal(2, await setup.RunAsync(["--provider"]));
        Assert.Equal(2, await setup.RunAsync(["--unknown"]));
        Assert.Equal(2, await setup.RunAsync(["--batch-separator", "  "]));
        Assert.Equal(2, await setup.RunAsync(["--provider", "dbase", "--connection", "x"]));
    }

    [Fact]
    public async Task SetupCreatesAndOptionallyApplies()
    {
        var (dir, migrations) = TempMigrations();
        try
        {
            var connection = Memory();
            var setup = Command<MigrateSetup>();
            var prev = Environment.CurrentDirectory;
            Environment.CurrentDirectory = dir;
            try
            {
                Assert.Equal(
                    0,
                    await setup.RunAsync(["--provider", "sqlite", "--connection", connection, "--create-database"])
                );
            }
            finally
            {
                Environment.CurrentDirectory = prev;
            }
            Assert.Equal(
                0,
                await setup.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-path",
                    migrations,
                    "--create-database",
                ])
            );
            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_up.sql"), "CREATE TABLE t (id INT);\n");
            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_down.sql"), "DROP TABLE t;\n");
            Assert.Equal(
                0,
                await setup.RunAsync([
                    "--provider=sqlite",
                    "--connection=" + connection,
                    "--migrate-path",
                    migrations,
                    "--and-up",
                    "--batch-separator",
                    "GO",
                ])
            );
            Assert.Equal(
                0,
                await setup.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-path",
                    migrations,
                    "--and-up",
                ])
            );
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    [Fact]
    public async Task SetupAndUpFailOnBadSql()
    {
        var (dir, migrations) = TempMigrations();
        try
        {
            var connection = Memory();
            var setup = Command<MigrateSetup>();
            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_up.sql"), "NOT VALID;\n");
            Assert.Equal(
                1,
                await setup.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-path",
                    migrations,
                    "--and-up",
                ])
            );
            var asFile = Path.Combine(dir, "not-a-dir");
            File.WriteAllText(asFile, "x");
            Assert.Equal(
                1,
                await setup.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-path",
                    asFile,
                ])
            );
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    [Fact]
    public async Task UpHelpOneAndErrors()
    {
        var up = Command<MigrateUp>();
        Assert.Equal(0, await up.RunAsync(["-h"]));
        Assert.Equal(2, await up.RunAsync([]));
        Assert.Equal(2, await up.RunAsync(["--provider", "dbase", "--connection", "x"]));
        Assert.Equal(2, await up.RunAsync(["--batch-separator", "   "]));
        Assert.Equal(2, await up.RunAsync(["--bogus"]));
        Assert.Equal(2, await up.RunAsync(["--provider"]));
        Assert.Equal(2, await up.RunAsync(["--migrate-root", "tmp"]));
        Assert.Equal(2, await up.RunAsync(["--provider", "sqlite"]));

        var (dir, migrations) = TempMigrations();
        try
        {
            var connection = Memory();
            await new SqliteProvider().Setup(connection);
            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_up.sql"), "CREATE TABLE t (id INT);\n");
            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_down.sql"), "DROP TABLE t;\n");
            await File.WriteAllTextAsync(Path.Combine(migrations, "0002_next_up.sql"), "CREATE TABLE u (id INT);\n");
            await File.WriteAllTextAsync(Path.Combine(migrations, "0002_next_down.sql"), "DROP TABLE u;\n");
            Assert.Equal(
                0,
                await up.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-path",
                    migrations,
                    "--one",
                    "--batch-separator",
                    "GO",
                ])
            );
            Assert.Equal(
                0,
                await up.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-path",
                    migrations,
                    "--migrations-root",
                    dir,
                ])
            );
            Assert.Equal(
                1,
                await up.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-path",
                    Path.Combine(dir, "missing"),
                ])
            );
            Assert.Equal(
                0,
                await up.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-path",
                    migrations,
                ])
            );
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    [Fact]
    public async Task DownHelpConfirmAndErrors()
    {
        var down = Command<MigrateDown>();
        Assert.Equal(0, await down.RunAsync(["--help"]));
        Assert.Equal(2, await down.RunAsync([]));
        Assert.Equal(2, await down.RunAsync(["--provider", "dbase", "--connection", "x", "--confirm"]));
        Assert.Equal(2, await down.RunAsync(["--provider", "sqlite", "--connection", "x"]));

        var (dir, migrations) = TempMigrations();
        try
        {
            var connection = Memory();
            var setup = Command<MigrateSetup>();
            await setup.RunAsync(["--provider", "sqlite", "--connection", connection, "--migrations-path", migrations]);
            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_up.sql"), "CREATE TABLE t (id INT);\n");
            await File.WriteAllTextAsync(Path.Combine(migrations, "0001_init_down.sql"), "DROP TABLE t;\n");
            await Command<MigrateUp>()
                .RunAsync(["--provider", "sqlite", "--connection", connection, "--migrations-path", migrations]);
            Assert.Equal(
                0,
                await down.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-path",
                    migrations,
                    "--confirm",
                    "--batch-separator",
                    "GO",
                ])
            );
            Assert.Equal(
                0,
                await down.RunAsync([
                    "--provider=sqlite",
                    "--connection=" + connection,
                    "--migrate-path=" + migrations,
                    "--confirm",
                ])
            );
            Assert.Equal(
                1,
                await down.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-path",
                    Path.Combine(dir, "missing"),
                    "--confirm",
                ])
            );
            Assert.Equal(2, await down.RunAsync(["--provider", "sqlite", "--connection", connection, "--bogus"]));
            Assert.Equal(2, await down.RunAsync(["--migrations-root"]));
            Assert.Equal(2, await down.RunAsync(["--batch-separator", "   "]));
            Assert.Equal(2, await down.RunAsync(["--migrate-root", dir]));
            Assert.Equal(
                2,
                await down.RunAsync([
                    "--provider",
                    "sqlite",
                    "--connection",
                    connection,
                    "--migrations-root",
                    dir,
                ])
            );
            Assert.True(MigrateDown.ConfirmOrAbort("sqlite", true, true, new StringReader("")));
            Assert.False(MigrateDown.ConfirmOrAbort("sqlite", false, true, new StringReader("")));
            Assert.True(MigrateDown.ConfirmOrAbort("sqlite", false, false, new StringReader("confirm\n")));
            Assert.False(MigrateDown.ConfirmOrAbort("sqlite", false, false, new StringReader("nope\n")));
            Assert.False(MigrateDown.ConfirmOrAbort("sqlite", false, false, new StringReader("")));
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    [Fact]
    public async Task CreateHelpAndScaffold()
    {
        var create = Command<MigrateCreate>();
        Assert.Equal(0, await create.RunAsync(["--help"]));
        Assert.Equal(2, await create.RunAsync([]));
        Assert.Equal(2, await create.RunAsync(["--provider", "sqlite"]));
        Assert.Equal(2, await create.RunAsync(["--provider", "sqlite", "--name", "Bad"]));
        Assert.Equal(2, await create.RunAsync(["--provider", "dbase", "--name", "add_users"]));
        Assert.Equal(2, await create.RunAsync(["--name"]));
        Assert.Equal(2, await create.RunAsync(["--bogus"]));

        var (dir, migrations) = TempMigrations();
        try
        {
            var prev = Environment.CurrentDirectory;
            Environment.CurrentDirectory = dir;
            try
            {
                Assert.Equal(0, await create.RunAsync(["--provider", "sqlite", "--name", "add_tmp"]));
            }
            finally
            {
                Environment.CurrentDirectory = prev;
            }
            Assert.Equal(
                0,
                await create.RunAsync([
                    "--provider",
                    "sqlite",
                    "--name",
                    "add_users",
                    "--migrations-path",
                    migrations,
                ])
            );
            Assert.Equal(
                0,
                await create.RunAsync(["--provider=sqlite", "--name=add_orders", "--migrate-path=" + migrations])
            );
            var asFile = Path.Combine(dir, "not-a-dir");
            File.WriteAllText(asFile, "x");
            Assert.Equal(
                1,
                await create.RunAsync(["--provider", "sqlite", "--name", "add_x", "--migrations-path", asFile])
            );
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }
}
