namespace Deterministic.MigrateRunner.Tests;

public sealed class DialectCoverageTests
{
    private static IEnumerable<ISqlDialect> EveryDialect() =>
        new ServiceCollection()
            .AddMigrateRunner()
            .BuildServiceProvider()
            .GetRequiredService<ISqlDialectFactory>()
            .All();

    [Fact]
    public void SurfaceOfEveryDialect()
    {
        foreach (var dialect in EveryDialect())
        {
            Assert.False(string.IsNullOrEmpty(dialect.Name));
            Assert.NotEmpty(dialect.ConnectionEnvironmentVariables);
            Assert.Contains("migrates", dialect.MigratesDdl, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("migrate_logs", dialect.MigrateLogsDdl, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("migrates", dialect.SelectAppliedChecksumSql, StringComparison.OrdinalIgnoreCase);
            Assert.False(string.IsNullOrEmpty(dialect.InsertAppliedSql));
            Assert.False(string.IsNullOrEmpty(dialect.DeleteAppliedSql));
            Assert.False(string.IsNullOrEmpty(dialect.QuoteIdent("t")));
            Assert.False(string.IsNullOrEmpty(dialect.Placeholder("p1")));
            Assert.False(string.IsNullOrEmpty(dialect.NowExpr));
            Assert.Contains("1", dialect.LimitClause(1), StringComparison.Ordinal);
            dialect.PrepareSetup("coverage");
            using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(ConnectionFor(dialect)));
            using var cmd = conn.CreateCommand();
            dialect.AddParameter(cmd, "p1", "v");
            Assert.NotEmpty(cmd.Parameters);
        }
    }

    [Fact]
    public void SqlitePathsAndSetup()
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
        d.PrepareSetup(":memory:");
        d.PrepareSetup("app.sqlite");

        var dir = Path.Combine(Path.GetTempPath(), $"migraters-cs-sqlite-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        try
        {
            var existing = Path.Combine(dir, "exists.sqlite");
            File.WriteAllBytes(existing, []);
            Assert.Null(d.PrerequisiteError(existing));
            Assert.Null(d.PrerequisiteError($"Data Source={existing}"));
            Assert.Null(d.PrerequisiteError($"Data Source={existing};Mode=ReadWrite"));

            var missing = Path.Combine(dir, "nested", "missing.sqlite");
            var err = d.PrerequisiteError(missing);
            Assert.NotNull(err);
            Assert.Contains(missing, err, StringComparison.Ordinal);
            d.PrepareSetup(missing);
            Assert.True(Directory.Exists(Path.GetDirectoryName(missing)));

            Assert.NotNull(d.PrerequisiteError($"sqlite://{missing}"));
            Assert.NotNull(d.PrerequisiteError($"sqlite:{missing}"));
            Assert.NotNull(d.PrerequisiteError($"file:{missing}"));
            Assert.NotNull(d.PrerequisiteError($"SQLITE://{missing}"));
            Assert.NotNull(d.PrerequisiteError("other=value.sqlite"));
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void PostgresNormalizesUriAndLeavesAdoStrings()
    {
        var d = PostgresDialect.Instance;
        Assert.True(d.UseTransaction);
        Assert.Equal("Host=localhost", d.NormalizeConnectionString("Host=localhost"));

        var full = d.NormalizeConnectionString(
            "postgresql://user:pass@127.0.0.1:5433/app?Pooling=true"
        );
        StringAssertContainsAll(
            full,
            ["Host=127.0.0.1", "Port=5433", "Username=user", "Password=pass", "Database=app"]
        );

        var defaultPort = d.NormalizeConnectionString("postgres://onlyuser@127.0.0.1/app");
        StringAssertContainsAll(defaultPort, ["Port=5432", "Username=onlyuser", "Database=app"]);

        var noDb = d.NormalizeConnectionString("postgres://127.0.0.1");
        Assert.Contains("Host=127.0.0.1", noDb, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Database=", noDb, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void MysqlNormalizesUriAndLeavesAdoStrings()
    {
        var d = MysqlDialect.Instance;
        Assert.False(d.UseTransaction);
        Assert.Equal("`t`", d.QuoteIdent("t"));
        Assert.Equal("@p1", d.Placeholder("p1"));
        Assert.Equal("Server=localhost", d.NormalizeConnectionString("Server=localhost"));

        var full = d.NormalizeConnectionString(
            "mysql://root:secret@127.0.0.1:3307/app?AllowUserVariables=true"
        );
        StringAssertContainsAll(
            full,
            ["Server=127.0.0.1", "Port=3307", "User ID=root", "Password=secret", "Database=app"]
        );

        var defaultPort = d.NormalizeConnectionString("mysql://127.0.0.1/app");
        StringAssertContainsAll(defaultPort, ["Port=3306", "Database=app"]);
    }

    [Fact]
    public void SqlServerQuotesAndLimit()
    {
        var d = SqlServerDialect.Instance;
        Assert.True(d.UseTransaction);
        Assert.Equal("[t]", d.QuoteIdent("t"));
        Assert.Equal("@p1", d.Placeholder("p1"));
        Assert.Equal("SYSUTCDATETIME()", d.NowExpr);
        Assert.Equal("OFFSET 0 ROWS FETCH NEXT 4 ROWS ONLY", d.LimitClause(4));
        Assert.Equal("Server=localhost", d.NormalizeConnectionString("Server=localhost"));
        Assert.Null(d.PrerequisiteError("Server=localhost"));
        d.PrepareSetup("Server=localhost");
    }

    [Fact]
    public void OracleParsesUserPasswordConnect()
    {
        var d = OracleDialect.Instance;
        Assert.True(d.UseTransaction);
        Assert.Equal("\"t\"", d.QuoteIdent("t"));
        Assert.Equal(":p1", d.Placeholder("p1"));
        Assert.Equal("FETCH FIRST 5 ROWS ONLY", d.LimitClause(5));
        Assert.Equal(
            "User Id=scott;Password=tiger;Data Source=localhost/orcl",
            d.NormalizeConnectionString("scott/tiger@localhost/orcl")
        );
        Assert.Throws<ArgumentException>(() => d.NormalizeConnectionString("not-a-dsn"));
        Assert.Throws<ArgumentException>(() => d.NormalizeConnectionString("/p@c"));
        Assert.Throws<ArgumentException>(() => d.NormalizeConnectionString("u/p"));
        Assert.Null(d.PrerequisiteError("u/p@c"));
        d.PrepareSetup("u/p@c");
    }

    [Fact]
    public async Task CreateDatabaseIfMissingNoOpsWhenThereIsNoDatabaseName()
    {
        await SqliteDialect.Instance.CreateDatabaseIfMissingAsync(":memory:");
        await PostgresDialect.Instance.CreateDatabaseIfMissingAsync("Host=localhost");
        await PostgresDialect.Instance.CreateDatabaseIfMissingAsync("postgresql://127.0.0.1/postgres");
        await MysqlDialect.Instance.CreateDatabaseIfMissingAsync("Server=localhost");
        await SqlServerDialect.Instance.CreateDatabaseIfMissingAsync("Server=localhost");
        await SqlServerDialect.Instance.CreateDatabaseIfMissingAsync("Server=localhost;Database=master");
        await OracleDialect.Instance.CreateDatabaseIfMissingAsync("u/p@c");
    }

    private static string ConnectionFor(ISqlDialect dialect) =>
        dialect.Name switch
        {
            "sqlite" => ":memory:",
            "postgres" => "Host=127.0.0.1;Database=coverage",
            "mysql" => "Server=127.0.0.1;Database=coverage",
            "sqlserver" => "Server=127.0.0.1;Database=coverage",
            "oracle" => "scott/tiger@localhost/orcl",
            _ => throw new ArgumentOutOfRangeException(nameof(dialect), dialect.Name, null),
        };

    private static void StringAssertContainsAll(string haystack, string[] needles)
    {
        foreach (var needle in needles)
            Assert.Contains(needle, haystack, StringComparison.OrdinalIgnoreCase);
    }
}
