namespace Deterministic.MigrateRunner.Tests;

public sealed class SqlDriverTests
{
    [Fact]
    public async Task SplitOnGoRunsEachBatch()
    {
        var provider = new SqliteDialect();
        var connection = $"Data Source=migraters-go-{Guid.NewGuid():N};Mode=Memory;Cache=Shared";
        await provider.Setup(connection);
        await provider.MigrateUp(
            connection,
            "go_split",
            "CREATE TABLE a (id INT);\nGO\nCREATE TABLE b (id INT);",
            "sum"
        );
        var applied = await provider.Applied(connection);
        Assert.True(applied.ContainsKey("go_split"));
    }
}
