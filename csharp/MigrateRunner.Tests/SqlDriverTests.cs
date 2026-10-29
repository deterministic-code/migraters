namespace Deterministic.MigrateRunner.Tests;

public sealed class SqlDriverTests
{
    [Fact]
    public async Task SplitOnGoRunsEachBatch()
    {
        var provider = new SqliteProvider();
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

    [Fact]
    public void SplitOnGoKeepsSemicolonsInsideOneBatch()
    {
        Assert.Equal(["BEGIN\n  SELECT 1;\nEND;"], DbExecute.SplitOnGo("BEGIN\n  SELECT 1;\nEND;"));
    }

    [Fact]
    public void SplitOnGoUsesCustomToken()
    {
        Assert.Equal(["SELECT 1;", "SELECT 2;"], DbExecute.SplitOnGo("SELECT 1;\n;;\nSELECT 2;", ";;"));
    }

    [Fact]
    public void SplitOnGoAcceptsCommentAndDate()
    {
        Assert.Equal(
            ["SELECT 1;", "SELECT 2;", "SELECT 3;"],
            DbExecute.SplitOnGo("SELECT 1;\nGO -- rebuild\nSELECT 2;\nGO 2026-10-29 -- note\nSELECT 3;")
        );
    }

    [Fact]
    public void SplitOnGoIgnoresPrefixMatch()
    {
        Assert.Equal(
            ["SELECT GOING;\nGOING\nSELECT 2;"],
            DbExecute.SplitOnGo("SELECT GOING;\nGOING\nSELECT 2;")
        );
    }
}
