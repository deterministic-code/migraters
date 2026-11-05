namespace Deterministic.MigrateRunner.Tests;

public sealed class CoreLibraryTests
{
    [Fact]
    public void CliHelpersCoverHostFlagsAndPaths()
    {
        Assert.Equal("up", MigrateCli.VerbFromCandidates(["/usr/bin/migrate-up"]));
        Assert.Equal("setup", MigrateCli.VerbFromCandidates([null, "migrate-SETUP.exe"]));
        Assert.Null(MigrateCli.VerbFromCandidates([null, "", "dotnet", "migrate-init"]));
        Assert.Null(MigrateCli.VerbFromHost());
        Assert.Equal("up", MigrateCli.NormalizeVerb("migrate-UP"));
        Assert.Equal("down", MigrateCli.NormalizeVerb("Down"));
        Assert.Equal("sql/sqlite/migrations", MigrateCli.MigratePath("sqlite", null, null));
        Assert.Equal("custom/sqlite/migrations", MigrateCli.MigratePath("sqlite", null, "custom"));
        Assert.Equal("/abs", MigrateCli.MigratePath("sqlite", "/abs", "custom"));
        Assert.Equal("sqlite", MigrateCli.NormalizeProvider("SQLite3"));
        Assert.Equal("postgres", MigrateCli.NormalizeProvider("pg"));
        Assert.Equal("sqlserver", MigrateCli.NormalizeProvider("ms-sql-server"));
        Assert.Null(MigrateCli.NormalizeProvider("dbase"));
        Assert.Equal("mssqlserver", CliSpec.StripKey("MS SQL_Server"));
        Assert.True(MigrateCli.IsValueFlag("--provider"));
        Assert.True(MigrateCli.IsValueFlag("--name=x"));
        Assert.False(MigrateCli.IsValueFlag("--and-up"));
        Assert.False(MigrateCli.MissingProvider(out var missingProvider));
        Assert.False(missingProvider.Length == 0);
        Assert.False(MigrateCli.MissingName(out var missingName));
        Assert.Contains("name", missingName, StringComparison.OrdinalIgnoreCase);
        Assert.False(MigrateCli.TryBatchSeparator("  ", out _, out var empty));
        Assert.Contains("batch", empty, StringComparison.OrdinalIgnoreCase);
        Assert.True(MigrateCli.TryBatchSeparator(";;", out var sep, out _));
        Assert.Equal(";;", sep);
        Assert.Contains("--foo", MigrateCli.ParseArgError("--foo", true), StringComparison.Ordinal);
        Assert.Contains("unknown", MigrateCli.ParseArgError("--foo", false), StringComparison.OrdinalIgnoreCase);
        var i = 0;
        Assert.False(MigrateCli.TryTakeFlag(["--provider"], ref i, "--provider", "--provider", out _));
        i = 0;
        Assert.True(MigrateCli.TryTakeFlag(["--provider", "sqlite"], ref i, "--provider", "--provider", out var v));
        Assert.Equal("sqlite", v);
        i = 0;
        Assert.True(MigrateCli.TryTakeFlag(["--provider=sqlite"], ref i, "--provider=sqlite", "--provider", out v));
        Assert.Equal("sqlite", v);
        i = 0;
        Assert.False(MigrateCli.TryTakeFlag(["--other"], ref i, "--other", "--provider", out _));
    }

    [Fact]
    public void HelpTemplatesFillAndRead()
    {
        Assert.Contains("Usage:", HelpTemplates.ProgramUsage(), StringComparison.Ordinal);
        Assert.Contains("migrate-up", HelpTemplates.Read("up"), StringComparison.Ordinal);
        Assert.Contains("migrate-setup", HelpTemplates.Read("migrate-setup"), StringComparison.Ordinal);
        Assert.Equal("plain", HelpTemplates.Fill("plain", null));
        Assert.Equal("plain", HelpTemplates.Fill("plain", new Dictionary<string, string>()));
        Assert.Equal("xy", HelpTemplates.Fill("{{a}}{{b}}", new Dictionary<string, string> { ["a"] = "x", ["b"] = "y" }));
        Assert.Contains("add_users", HelpTemplates.Scaffold("up", new Dictionary<string, string> { ["name"] = "add_users" }));
    }

    [Fact]
    public void ChecksumStripsLegacyHeader()
    {
        const string body = "CREATE TABLE t (id INT);\n";
        const string header =
            "-- deterministic-content-hash: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n";
        Assert.Equal(Checksum.Hex(body), Checksum.Hex(header + body));
    }

    [Fact]
    public void ConnectionStringUrlParsesParts()
    {
        Assert.True(ConnectionStringUrl.LooksLikeUrl("postgres://x", "postgres"));
        Assert.False(ConnectionStringUrl.LooksLikeUrl("host=x", "postgres"));
        Assert.Equal((null, null), ConnectionStringUrl.SplitUserInfo(""));
        Assert.Equal(("u", "p"), ConnectionStringUrl.SplitUserInfo("u:p"));
        Assert.Equal(("u", null), ConnectionStringUrl.SplitUserInfo("u"));
        Assert.Equal("db", ConnectionStringUrl.TrimLeadingSlash("/db"));
        Assert.Equal("db", ConnectionStringUrl.TrimLeadingSlash("db"));
        Assert.Empty(ConnectionStringUrl.ParseQuery(""));
        Assert.Equal("a", ConnectionStringUrl.ParseQuery("?a=1&b=2").First().Key);
        Assert.Equal("", ConnectionStringUrl.ParseQuery("flag").Single().Value);
        Assert.Equal("postgres://x", ConnectionStringUrl.TryUri("postgres://x", "postgres"));
        Assert.Null(ConnectionStringUrl.TryUri("x", "postgres"));
        string? user = "unset";
        string? pass = "unset";
        var db = "";
        var query = new List<string>();
        ConnectionStringUrl.ApplyUriParts(
            new Uri("postgres://u:p@localhost:5432/app?ssl=true"),
            (a, b) =>
            {
                user = a;
                pass = b;
            },
            d => db = d,
            (k, v) => query.Add($"{k}={v}")
        );
        Assert.Equal("u", user);
        Assert.Equal("p", pass);
        Assert.Equal("app", db);
        Assert.Contains("ssl=true", query);
        ConnectionStringUrl.ApplyUriParts(
            new Uri("postgres://localhost/"),
            (_, _) => { },
            _ => throw new InvalidOperationException("no db"),
            (_, _) => throw new InvalidOperationException("no query")
        );
    }

    [Fact]
    public void ConnectionNormalizerSqliteAndOracle()
    {
        Assert.Equal("Data Source=:memory:", ConnectionNormalizer.Sqlite(null));
        Assert.Equal("Data Source=:memory:", ConnectionNormalizer.Sqlite(""));
        Assert.Equal("Data Source=:memory:", ConnectionNormalizer.Sqlite("sqlite://"));
        Assert.Equal("Data Source=./app.sqlite", ConnectionNormalizer.Sqlite("sqlite:///./app.sqlite"));
        Assert.Equal("Data Source=foo.db", ConnectionNormalizer.Sqlite("foo.db"));
        Assert.Equal("Data Source=x.db", ConnectionNormalizer.Sqlite("Data Source=x.db"));
        Assert.True(ConnectionNormalizer.SqliteIsMemory(null));
        Assert.True(ConnectionNormalizer.SqliteIsMemory(":memory:"));
        Assert.True(ConnectionNormalizer.SqliteIsMemory("file:x?mode=memory"));
        Assert.True(ConnectionNormalizer.SqliteIsMemory("file:x&mode=memory"));
        Assert.True(ConnectionNormalizer.SqliteIsMemory("Data Source=x;Mode=Memory"));
        Assert.True(ConnectionNormalizer.SqliteIsMemory("mode=memory"));
        Assert.False(ConnectionNormalizer.SqliteIsMemory("./app.sqlite"));
        Assert.Null(ConnectionNormalizer.SqliteFilesystemPath(":memory:"));
        Assert.Equal("./from.sqlite", ConnectionNormalizer.SqliteFilesystemPath("Data Source=./from.sqlite"));
        Assert.Equal("./from.sqlite", ConnectionNormalizer.SqliteFilesystemPath("Data Source=./from.sqlite;Mode=ReadWrite"));
        Assert.Equal("foo.db", ConnectionNormalizer.SqliteFilesystemPath("sqlite:foo.db"));
        Assert.Equal("bar.db", ConnectionNormalizer.SqliteFilesystemPath("file:bar.db?cache=shared"));
        Assert.Null(ConnectionNormalizer.SqliteFilesystemPath("sqlite://"));
        Assert.Equal("User Id=u;Password=p;Data Source=//h:1521/orcl", ConnectionNormalizer.Oracle("u/p@//h:1521/orcl"));
        Assert.Throws<ArgumentException>(() => ConnectionNormalizer.Oracle("nocolon"));
    }

    [Fact]
    public void ConfigWalksParentsAndStops()
    {
        var root = Path.Combine(Path.GetTempPath(), $"migraters-cfg-{Guid.NewGuid():N}");
        var child = Path.Combine(root, "a", "b");
        Directory.CreateDirectory(child);
        try
        {
            Assert.Null(MigratersConfig.FindPath(child));
            File.WriteAllText(Path.Combine(root, MigratersConfig.FileName), "providers:\n  - name: sqlite\n");
            Assert.Equal(Path.Combine(root, MigratersConfig.FileName), MigratersConfig.FindPath(child));
            Assert.NotEmpty(MigratersConfig.EnabledProviders());
            var isolated = Path.Combine(Path.GetTempPath(), $"migraters-empty-{Guid.NewGuid():N}");
            Directory.CreateDirectory(isolated);
            var cwd = Environment.CurrentDirectory;
            try
            {
                Environment.CurrentDirectory = isolated;
                Assert.Empty(MigratersConfig.EnabledProviders());
            }
            finally
            {
                Environment.CurrentDirectory = cwd;
                Directory.Delete(isolated, true);
            }
            Assert.Equal(
                ["sqlite", "postgres"],
                MigratersConfig
                    .ParseProviders(
                        """
                        providers:
                          - name: sqlite
                            location: here

                          - name:

                          - extra
                          - name: postgres
                        binDir: x
                          - name: ignored
                        """
                    )
                    .Select(p => p.Name)
            );
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }

    [Fact]
    public void FactoryAndResolverMisses()
    {
        var factory = new ProviderFactory();
        Assert.False(factory.TryGet("dbase", out _));
        Assert.Contains(factory.All(), p => p.Name == "sqlite");
        Assert.Null(new ConnectionResolver().FromEnvironment("dbase"));
        var prev = Environment.GetEnvironmentVariable("SQLITE_PATH");
        try
        {
            Environment.SetEnvironmentVariable("SQLITE_PATH", "./from-env.sqlite");
            Assert.Equal("./from-env.sqlite", new ConnectionResolver().FromEnvironment("sqlite"));
        }
        finally
        {
            Environment.SetEnvironmentVariable("SQLITE_PATH", prev);
        }
    }

    [Fact]
    public void FactoryRejectsUnknownEnabledProvider()
    {
        var root = Path.Combine(Path.GetTempPath(), $"migraters-ghost-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var prev = Environment.CurrentDirectory;
        try
        {
            File.WriteAllText(Path.Combine(root, MigratersConfig.FileName), "providers:\n  - name: ghost\n");
            Environment.CurrentDirectory = root;
            var ex = Assert.Throws<InvalidOperationException>(() => new ProviderFactory());
            Assert.Equal("ghost", ex.Message);
        }
        finally
        {
            Environment.CurrentDirectory = prev;
            Directory.Delete(root, true);
        }
    }

    [Fact]
    public void FactoryRejectsMissingProviderDll()
    {
        var root = Path.Combine(Path.GetTempPath(), $"migraters-pg-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var prev = Environment.CurrentDirectory;
        try
        {
            File.WriteAllText(Path.Combine(root, MigratersConfig.FileName), "providers:\n  - name: postgres\n");
            Environment.CurrentDirectory = root;
            var ex = Assert.Throws<InvalidOperationException>(() => new ProviderFactory());
            Assert.Equal("postgres", ex.Message);
        }
        finally
        {
            Environment.CurrentDirectory = prev;
            Directory.Delete(root, true);
        }
    }

    [Fact]
    public void ResolveProviderUsesEnvAndRejectsMissingConnection()
    {
        var factory = new ProviderFactory();
        var resolver = new ConnectionResolver();
        Assert.IsType<ProviderResolution.Rejected>(MigrateCli.ResolveProvider(factory, resolver, "dbase", null));
        var prev = Environment.GetEnvironmentVariable("SQLITE_PATH");
        try
        {
            Environment.SetEnvironmentVariable("SQLITE_PATH", null);
            Environment.SetEnvironmentVariable("DB_PATH", null);
            Assert.IsType<ProviderResolution.Rejected>(
                MigrateCli.ResolveProvider(factory, resolver, "sqlite", null)
            );
            Environment.SetEnvironmentVariable("SQLITE_PATH", "env.db");
            var ready = Assert.IsType<ProviderResolution.Ready>(
                MigrateCli.ResolveProvider(factory, resolver, "sqlite", null)
            );
            Assert.Equal("env.db", ready.Connection);
            var flagged = Assert.IsType<ProviderResolution.Ready>(
                MigrateCli.ResolveProvider(factory, resolver, "sqlite", "flag.db")
            );
            Assert.Equal("flag.db", flagged.Connection);
            var custom = new CustomNamedProvider();
            Assert.IsType<ProviderResolution.Rejected>(
                MigrateCli.ResolveProvider(new FixedFactory(custom), resolver, "custom", null)
            );
        }
        finally
        {
            Environment.SetEnvironmentVariable("SQLITE_PATH", prev);
        }
    }

    private sealed class FixedFactory(IDatasourceProvider provider) : IProviderFactory
    {
        public IReadOnlyList<IDatasourceProvider> All() => [provider];

        public bool TryGet(string name, out IDatasourceProvider resolved)
        {
            resolved = provider;
            return true;
        }
    }

    private sealed class CustomNamedProvider : IDatasourceProvider
    {
        public string Name => "custom";
        public void PrepareSetup(string connection) { }
        public Task CreateDatabaseIfMissingAsync(string connection) => Task.CompletedTask;
        public Task Setup(string connection) => Task.CompletedTask;
        public Task<IReadOnlyDictionary<string, string?>> Applied(string connection) =>
            Task.FromResult<IReadOnlyDictionary<string, string?>>(new Dictionary<string, string?>());
        public Task MigrateUp(string connection, string name, string body, string checksum, string batchSeparator = "GO") =>
            Task.CompletedTask;
        public Task MigrateDown(string connection, string name, string body, string batchSeparator = "GO") =>
            Task.CompletedTask;
        public Task<long> Log(
            string connection,
            long? id,
            string name,
            string direction,
            string? status,
            long durationMs,
            string? error
        ) => Task.FromResult(1L);
    }

    [Fact]
    public void FactoryActivateRejectsMissingAndNonProviderTypes()
    {
        var core = typeof(ProviderEntry).Assembly.Location;
        Assert.Throws<InvalidOperationException>(() =>
            ProviderFactory.Activate(core, "Deterministic.MigrateRunner.DoesNotExist", "missing-type")
        );
        Assert.Throws<InvalidOperationException>(() =>
            ProviderFactory.Activate(core, typeof(ConnectionResolver).FullName!, "not-provider")
        );
        var sqlite = Path.Combine(AppContext.BaseDirectory, "MigrateSqlite.dll");
        Assert.Equal(
            "sqlite",
            ProviderFactory
                .Activate(sqlite, "Deterministic.MigrateRunner.SqliteProvider", "sqlite")
                .Name
        );
    }

    [Fact]
    public void CliSpecParserCoversInlineArgsAndFallbackPath()
    {
        Assert.Equal("fallback.yaml", CliSpec.ExistingPath(Path.Combine(Path.GetTempPath(), "no-cli.yaml"), "fallback.yaml"));
        Assert.Equal(
            Path.Combine(AppContext.BaseDirectory, "cli.yaml"),
            CliSpec.ExistingPath(Path.Combine(AppContext.BaseDirectory, "cli.yaml"), "fallback.yaml")
        );
        var count = CliSpec.CommandCountFor(
            """
            # comment

            providers:
            - sqlite
            command: migrate-{verb}
            env_var_list_separator: unquoted
            providers:
              - sqlite
            languages:
              - rust
            provider_aliases:
            :
              pg: postgres
              ---: oracle
              blank: 
            connection_environment:
            nosep
              sqlite: [SQLITE_PATH, DB_PATH]
            other:
              - ignored
            commands:
              - verb: setup
                args:
                  - {flag: --provider, placeholder: providers, required: true}
                  - {flag: --x, no-colon}
                  - {unknown: 1, required: false}
                  - flag: --one
                    placeholder: n
                    required: true
              - verb: up
                args:
                  - flag: --help
            leftover: 1
            """
        );
        Assert.Equal(2, count);
        var aliases = new Dictionary<string, string>(StringComparer.Ordinal);
        CliSpec.AddAlias(aliases, "", "sqlite");
        CliSpec.AddAlias(aliases, "pg", "");
        CliSpec.AddAlias(aliases, "pg", "postgres");
        Assert.Equal("postgres", aliases["pg"]);
    }
}
