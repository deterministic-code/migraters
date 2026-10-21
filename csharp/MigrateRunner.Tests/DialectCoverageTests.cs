namespace Deterministic.MigrateRunner.Tests;

public sealed class DialectCoverageTests
{
    [Fact]
    public void SqliteSurfaceAndMemory()
    {
        var dialect = SqliteDialect.Instance;
        var d = (SqlDialect)dialect;
        Assert.True(d.UseTransaction);
        Assert.Equal("\"t\"", d.QuoteIdent("t"));
        Assert.Equal("$p1", d.Placeholder("p1"));
        Assert.Equal("CURRENT_TIMESTAMP", d.NowExpr);
        Assert.Equal("LIMIT 2", d.LimitClause(2));

        Assert.Equal("Data Source=:memory:", dialect.NormalizeConnectionString(null!));
        Assert.Null(dialect.PrerequisiteError(null!));
        dialect.PrepareSetup(null!);
        Assert.Equal("Data Source=:memory:", dialect.NormalizeConnectionString(""));
        Assert.Equal("Data Source=:memory:", dialect.NormalizeConnectionString("sqlite://"));
        Assert.Equal("Data Source=./app.sqlite", dialect.NormalizeConnectionString("sqlite://./app.sqlite"));
        Assert.Equal("Data Source=./app.sqlite", dialect.NormalizeConnectionString("./app.sqlite"));
        Assert.Equal("Data Source=x.db", dialect.NormalizeConnectionString("Data Source=x.db"));
        Assert.Equal("Data Source=foo.db", dialect.NormalizeConnectionString("SQLITE://foo.db"));

        Assert.Null(dialect.PrerequisiteError(":memory:"));
        Assert.Null(dialect.PrerequisiteError(""));
        Assert.Null(dialect.PrerequisiteError("Data Source=:memory:"));
        Assert.Null(dialect.PrerequisiteError("Data Source=migraters-test;Mode=Memory;Cache=Shared"));
        dialect.PrepareSetup(":memory:");
        dialect.PrepareSetup("Data Source=migraters-test;Mode=Memory;Cache=Shared");

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
