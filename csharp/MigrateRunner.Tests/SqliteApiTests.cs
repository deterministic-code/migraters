namespace Deterministic.MigrateRunner.Tests;

public sealed class SqliteApiTests
{
    [Fact]
    public async Task SetupUpDown()
    {
        var dialect = SqliteDialect.Instance;
        var dir = Path.Combine(Path.GetTempPath(), $"migraters-api-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        var connection = $"Data Source=migraters-api-{Guid.NewGuid():N};Mode=Memory;Cache=Shared";
        var migrationsPath = Path.Combine(dir, "migrations");
        await using var keep = await dialect.OpenAsync(connection);
        try
        {
            IMigrater migrater = new Migrater(dialect);
            await migrater.Setup(new SetupArg(connection, migrationsPath));
            const string sql = "CREATE TABLE t (id INTEGER);\n";
            await File.WriteAllTextAsync(Path.Combine(migrationsPath, "0001_init_up.sql"), sql);
            await File.WriteAllTextAsync(Path.Combine(migrationsPath, "0001_init_down.sql"), "DROP TABLE t;\n");

            var names = await migrater.Up(new UpArg(connection, migrationsPath));
            Assert.Equal(["0001_init"], names);

            await using var driver = await dialect.OpenAsync(connection);
            var applied = await driver.Applied();
            Assert.Equal(Checksum.Hex(sql), applied["0001_init"]);

            var rolled = await migrater.Down(new DownArg(connection, migrationsPath));
            Assert.Equal("0001_init", rolled);
            applied = await driver.Applied();
            Assert.False(applied.ContainsKey("0001_init"));
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
