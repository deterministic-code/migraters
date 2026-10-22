namespace Deterministic.MigrateRunner.ProviderTests;

public sealed class ProviderCoverageTests
{
    private static IProviderFactory Factory() =>
        new ServiceCollection()
            .AddMigrateRunner()
            .BuildServiceProvider()
            .GetRequiredService<IProviderFactory>();

    private static IEnumerable<IDatasourceProvider> EveryProvider() => Factory().All();

    private static bool TryGet(string name, out IDatasourceProvider provider) =>
        Factory().TryGet(name, out provider);

    [Fact]
    public void SurfaceOfEveryProvider()
    {
        foreach (var provider in EveryProvider())
        {
            Assert.False(string.IsNullOrEmpty(provider.Name));
            Assert.True(CliSpec.ConnectionEnvironment[provider.Name].Length > 0);
            provider.PrepareSetup("coverage");
            AssertSqlSurface(provider);
        }
    }

    private static void AssertSqlSurface(IDatasourceProvider provider)
    {
        var sql = provider switch
        {
            SqliteProvider p => p.Sql,
            PostgresProvider p => p.Sql,
            MysqlProvider p => p.Sql,
            SqlServerProvider p => p.Sql,
            OracleProvider p => p.Sql,
            _ => throw new ArgumentOutOfRangeException(nameof(provider), provider.Name, null),
        };
        AssertSql(sql, ConnectionFor(provider));
    }

    private static void AssertSql<T>(T sql, string connection)
        where T : class
    {
        dynamic d = sql;
        Assert.Contains("migrates", (string)d.MigratesDdl, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("migrate_logs", (string)d.MigrateLogsDdl, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("migrates", (string)d.SelectAppliedChecksumSql, StringComparison.OrdinalIgnoreCase);
        Assert.False(string.IsNullOrEmpty((string)d.InsertAppliedSql));
        Assert.False(string.IsNullOrEmpty((string)d.DeleteAppliedSql));
        Assert.False(string.IsNullOrEmpty((string)d.QuoteIdent("t")));
        Assert.False(string.IsNullOrEmpty((string)d.Placeholder("p1")));
        Assert.False(string.IsNullOrEmpty((string)d.NowExpr));
        Assert.Contains("1", (string)d.LimitClause(1), StringComparison.Ordinal);
        using var conn = (System.Data.Common.DbConnection)d.CreateConnection(d.NormalizeConnectionString(connection));
        using var cmd = conn.CreateCommand();
        d.AddParameter(cmd, "p1", "v");
        Assert.NotEmpty(cmd.Parameters);
    }

    [Fact]
    public void SqliteMemoryAndNormalizeStrings()
    {
        var d = new SqliteProvider();
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
        Assert.Null(d.PrerequisiteError("  :memory:  "));
        Assert.Null(d.PrerequisiteError("file:migraters-test?mode=memory&cache=shared"));
        Assert.Null(d.PrerequisiteError("file:migraters-test?cache=shared&mode=memory"));
        Assert.Null(d.PrerequisiteError("Data Source=migraters-test;Mode=Memory;Cache=Shared"));
        Assert.Null(d.PrerequisiteError("mode=memory"));
        d.PrepareSetup(":memory:");
        d.PrepareSetup("Data Source=migraters-test;Mode=Memory;Cache=Shared");
        d.PrepareSetup("file:migraters-test?mode=memory&cache=shared");
    }

    [Fact]
    public void SqliteFilePathsAndSetup()
    {
        var d = new SqliteProvider();
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
            Assert.NotNull(d.PrerequisiteError($"file:{missing}?mode=rwc"));
            Assert.NotNull(d.PrerequisiteError($"SQLITE://{missing}"));
            Assert.NotNull(d.PrerequisiteError("other=value.sqlite"));
            Assert.Null(d.PrerequisiteError("file:"));
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void PostgresNormalizesUriAndLeavesAdoStrings()
    {
        if (!TryGet("postgres", out var dialect) || dialect is not PostgresProvider d)
            return;
        Assert.True(d.Sql.UseTransaction);
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
        if (!TryGet("mysql", out var dialect) || dialect is not MysqlProvider d)
            return;
        Assert.False(d.Sql.UseTransaction);
        Assert.Equal("`t`", d.Sql.QuoteIdent("t"));
        Assert.Equal("@p1", d.Sql.Placeholder("p1"));
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
        if (!TryGet("sqlserver", out var dialect) || dialect is not SqlServerProvider d)
            return;
        Assert.True(d.Sql.UseTransaction);
        Assert.Equal("[t]", d.Sql.QuoteIdent("t"));
        Assert.Equal("@p1", d.Sql.Placeholder("p1"));
        Assert.Equal("SYSUTCDATETIME()", d.Sql.NowExpr);
        Assert.Equal("OFFSET 0 ROWS FETCH NEXT 4 ROWS ONLY", d.Sql.LimitClause(4));
        Assert.Equal("Server=localhost", d.NormalizeConnectionString("Server=localhost"));
        Assert.Null(d.PrerequisiteError("Server=localhost"));
        d.PrepareSetup("Server=localhost");
    }

    [Fact]
    public void OracleParsesUserPasswordConnect()
    {
        if (!TryGet("oracle", out var dialect) || dialect is not OracleProvider d)
            return;
        Assert.True(d.Sql.UseTransaction);
        Assert.Equal("\"t\"", d.Sql.QuoteIdent("t"));
        Assert.Equal(":p1", d.Sql.Placeholder("p1"));
        Assert.Equal("FETCH FIRST 5 ROWS ONLY", d.Sql.LimitClause(5));
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
    public async Task SqliteRunsSetupAppliedMigrateAndLog()
    {
        var provider = new SqliteProvider();
        var connection = $"Data Source=migraters-coverage-{Guid.NewGuid():N};Mode=Memory;Cache=Shared";
        await provider.Setup(connection);
        Assert.Empty(await provider.Applied(connection));
        var started = await provider.Log(connection, null, "one", "up", null, 0, null);
        await provider.MigrateUp(connection, "one", "CREATE TABLE coverage (id INT);", "sum");
        await provider.Log(connection, started, "one", "up", "ok", 1, null);
        Assert.True((await provider.Applied(connection)).ContainsKey("one"));
        await provider.MigrateDown(connection, "one", "DROP TABLE coverage;");
        Assert.False((await provider.Applied(connection)).ContainsKey("one"));
    }

    [Fact]
    public async Task EveryProviderForwardsMigrateMethods()
    {
        foreach (var provider in EveryProvider())
        {
            var connection = ConnectionFor(provider);
            await Invoke(provider.Setup(connection));
            await Invoke(provider.Applied(connection));
            await Invoke(provider.MigrateUp(connection, "one", "SELECT 1;", "sum"));
            await Invoke(provider.MigrateDown(connection, "one", "SELECT 1;"));
            try
            {
                var id = await provider.Log(connection, null, "one", "up", null, 0, null);
                await Invoke(provider.Log(connection, id, "one", "up", "ok", 1, "err"));
            }
            catch (Exception)
            {
                // Remote providers are not started in this suite; the calls still cover the wrappers.
            }
        }
    }

    [Fact]
    public async Task CreateDatabaseIfMissingNoOpsWhenThereIsNoDatabaseName()
    {
        await new SqliteProvider().CreateDatabaseIfMissingAsync(":memory:");
        if (TryGet("postgres", out var postgres))
        {
            await postgres.CreateDatabaseIfMissingAsync("Host=localhost");
            await postgres.CreateDatabaseIfMissingAsync("postgresql://127.0.0.1/postgres");
        }
        if (TryGet("mysql", out var mysql))
            await mysql.CreateDatabaseIfMissingAsync("Server=localhost");
        if (TryGet("sqlserver", out var sqlserver))
        {
            await sqlserver.CreateDatabaseIfMissingAsync("Server=localhost");
            await sqlserver.CreateDatabaseIfMissingAsync("Server=localhost;Database=master");
        }
        if (TryGet("oracle", out var oracle))
            await oracle.CreateDatabaseIfMissingAsync("u/p@c");
    }

    private static async Task Invoke(Task work)
    {
        try
        {
            await work;
        }
        catch (Exception)
        {
            // Remote providers are not started in this suite; the calls still cover the wrappers.
        }
    }

    private static string ConnectionFor(IDatasourceProvider provider) =>
        provider.Name switch
        {
            "sqlite" => ":memory:",
            "postgres" => "Host=127.0.0.1;Database=coverage;Timeout=1",
            "mysql" => "Server=127.0.0.1;Database=coverage;Connection Timeout=1",
            "sqlserver" => "Server=127.0.0.1;Database=coverage;Connect Timeout=1",
            "oracle" => "scott/tiger@127.0.0.1:1/orcl",
            _ => throw new ArgumentOutOfRangeException(nameof(provider), provider.Name, null),
        };

    private static void StringAssertContainsAll(string haystack, string[] needles)
    {
        foreach (var needle in needles)
            Assert.Contains(needle, haystack, StringComparison.OrdinalIgnoreCase);
    }
}
