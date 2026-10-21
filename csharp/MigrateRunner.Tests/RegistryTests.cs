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
    }

    [Fact]
    public void ReadsDialectsListFromMigratersYaml()
    {
        Assert.Equal(
            ["sqlite", "postgres"],
            MigratersConfig.ParseDialects(
                "language: csharp\ndialects:\n  - sqlite\n  - postgres\nbinDir: csharp/bin/Debug/net9.0\n"
            )
        );
        Assert.Empty(MigratersConfig.ParseDialects("language: rust\ndialects: []\nbinDir: rust/target/debug\n"));
    }

    [Fact]
    public void EnvVarOrderMatchesCliYaml()
    {
        var services = new ServiceCollection().AddMigrateRunner().BuildServiceProvider();
        foreach (var dialect in services.GetRequiredService<IDialectFactory>().All())
        {
            Assert.Equal(
                string.Join(CliSpec.EnvVarListSeparator, dialect.ConnectionEnvironmentVariables),
                MigrateCli.EnvVarsList(dialect.ConnectionEnvironmentVariables)
            );
        }
    }
}
