namespace Deterministic.MigrateRunner.Tests;

public sealed class RegistryTests
{
    [Fact]
    public void RegistersEveryCliYamlProviderAndAlias()
    {
        var services = new ServiceCollection().AddMigrateRunner().BuildServiceProvider();
        var factory = services.GetRequiredService<ISqlDialectFactory>();
        Assert.Equal(CliSpec.Providers, factory.All().Select(d => d.Name).ToArray());
        foreach (var (alias, canonical) in CliSpec.ProviderAliases)
        {
            Assert.True(factory.TryGet(alias, out var dialect), alias);
            Assert.Equal(canonical, dialect.Name);
        }
        Assert.True(factory.TryGet("MS-SQL-Server", out var sqlServer));
        Assert.Equal("sqlserver", sqlServer.Name);
        Assert.False(factory.TryGet("nope", out _));
    }

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
    public void EnvVarOrderMatchesCliYaml()
    {
        var services = new ServiceCollection().AddMigrateRunner().BuildServiceProvider();
        foreach (var dialect in services.GetRequiredService<ISqlDialectFactory>().All())
        {
            Assert.Equal(
                string.Join(CliSpec.EnvVarListSeparator, dialect.ConnectionEnvironmentVariables),
                MigrateCli.EnvVarsList(dialect.ConnectionEnvironmentVariables)
            );
        }
    }
}
