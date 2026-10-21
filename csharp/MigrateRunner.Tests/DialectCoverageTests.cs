namespace Deterministic.MigrateRunner.Tests;

public sealed class DialectCoverageTests
{
    [Fact]
    public void SqliteSurfaceAndMemory()
    {
        var d = SqliteDialect.Instance;
        Assert.True(d.UseTransaction);
        Assert.Equal("\"t\"", d.QuoteIdent("t"));
        Assert.Equal("$p1", d.Placeholder("p1"));
        Assert.Equal("CURRENT_TIMESTAMP", d.NowExpr);
        Assert.Equal("LIMIT 2", d.LimitClause(2));

        Assert.Equal("Data Source=:memory:", d.NormalizeConnectionString(null!));
        Assert.Null(d.PrerequisiteError(null!));
        d.PrepareSetup(null!);
        Assert.Equal("Data Source=:memory:", d.NormalizeConnectionString(""));
        Assert.Equal("Data Source=:memory:", d.NormalizeConnectionString("sqlite://"));
        Assert.Equal("Data Source=./app.sqlite", d.NormalizeConnectionString("sqlite://./app.sqlite"));
        Assert.Equal("Data Source=./app.sqlite", d.NormalizeConnectionString("./app.sqlite"));
        Assert.Equal("Data Source=x.db", d.NormalizeConnectionString("Data Source=x.db"));
        Assert.Equal("Data Source=foo.db", d.NormalizeConnectionString("SQLITE://foo.db"));

        Assert.Null(d.PrerequisiteError(":memory:"));
        Assert.Null(d.PrerequisiteError(""));
        Assert.Null(d.PrerequisiteError("Data Source=:memory:"));
        Assert.Null(d.PrerequisiteError("Data Source=migraters-test;Mode=Memory;Cache=Shared"));
        d.PrepareSetup(":memory:");
        d.PrepareSetup("Data Source=migraters-test;Mode=Memory;Cache=Shared");

        using var conn = d.CreateConnection(d.NormalizeConnectionString(":memory:"));
        using var cmd = conn.CreateCommand();
        d.AddParameter(cmd, "p1", "v");
        Assert.NotEmpty(cmd.Parameters);
    }

    [Fact]
    public async Task SqliteCreateDatabaseIfMissingNoOpsMemory()
    {
        await SqliteDialect.Instance.CreateDatabaseIfMissingAsync(":memory:");
    }
}
