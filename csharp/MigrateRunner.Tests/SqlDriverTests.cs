namespace Deterministic.MigrateRunner.Tests;

public sealed class SqlDriverTests
{
    [Fact]
    public void SplitOnGoSplitsWholeLineBatches()
    {
        Assert.Equal(
            ["CREATE TABLE a (id INT);", "CREATE TABLE b (id INT)"],
            DbExecute.SplitOnGo("CREATE TABLE a (id INT);\nGO\nCREATE TABLE b (id INT)")
        );
        Assert.Equal(["BEGIN\n  SELECT 1;\nEND;"], DbExecute.SplitOnGo("BEGIN\n  SELECT 1;\nEND;"));
    }
}
