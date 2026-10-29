namespace Deterministic.MigrateRunner.Tests;

public sealed class RegistryTests
{
    [Fact]
    public void UsageLineIncludesSpecFlags()
    {
        Assert.Contains("--provider", CliSpec.UsageLine("setup"), StringComparison.Ordinal);
        Assert.Contains("--connection", CliSpec.UsageLine("up"), StringComparison.Ordinal);
        Assert.Contains("--confirm", CliSpec.UsageLine("down"), StringComparison.Ordinal);
        Assert.Contains("--name", CliSpec.UsageLine("create"), StringComparison.Ordinal);
        Assert.Contains("--language", CliSpec.UsageLine("init"), StringComparison.Ordinal);
        Assert.Contains("--dialect", CliSpec.UsageLine("init"), StringComparison.Ordinal);
        Assert.Contains("--all", CliSpec.UsageLine("init"), StringComparison.Ordinal);
        Assert.Contains("--batch-separator", CliSpec.UsageLine("setup"), StringComparison.Ordinal);
        Assert.Contains("--batch-separator", CliSpec.UsageLine("up"), StringComparison.Ordinal);
        Assert.Contains("--batch-separator", CliSpec.UsageLine("down"), StringComparison.Ordinal);
    }

    [Fact]
    public void ReadsProvidersListFromMigratersYaml()
    {
        Assert.Equal(
            ["sqlite", "postgres"],
            MigratersConfig.ParseProviders(
                """
                language: csharp
                providers:
                  - name: sqlite
                    location: MigrateSqlite.dll!Deterministic.MigrateRunner.SqliteProvider
                  - name: postgres
                    location: MigratePostgres.dll!Deterministic.MigrateRunner.PostgresProvider
                binDir: csharp/bin/Debug/net9.0
                """
            ).Select(p => p.Name)
        );
        Assert.Empty(
            MigratersConfig.ParseProviders("language: rust\nproviders: []\nbinDir: rust/target/debug\n")
        );
    }

    [Fact]
    public void EnvVarOrderMatchesCliYaml()
    {
        foreach (var name in CliSpec.Providers)
        {
            if (!CliSpec.ConnectionEnvironment.TryGetValue(name, out var vars))
                continue;
            Assert.Equal(string.Join(CliSpec.EnvVarListSeparator, vars), MigrateCli.EnvVarsList(vars));
        }
    }
}
