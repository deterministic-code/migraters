namespace Deterministic.MigrateRunner.ProviderTests;

public sealed class RegistryTests
{
    [Fact]
    public void RegistersAttachedCliYamlProvidersAndAliases()
    {
        var services = new ServiceCollection().AddMigrateRunner().BuildServiceProvider();
        var factory = services.GetRequiredService<IDialectFactory>();
        var attached = factory.All().Select(d => d.Name).ToArray();
        Assert.NotEmpty(attached);
        Assert.Equal(CliSpec.Providers.Where(attached.Contains).ToArray(), attached);
        foreach (var (alias, canonical) in CliSpec.ProviderAliases)
        {
            if (!attached.Contains(canonical))
                continue;
            Assert.True(factory.TryGet(alias, out var dialect), alias);
            Assert.Equal(canonical, dialect.Name);
        }
        if (attached.Contains("sqlserver"))
        {
            Assert.True(factory.TryGet("MS-SQL-Server", out var sqlServer));
            Assert.Equal("sqlserver", sqlServer.Name);
        }
        Assert.False(factory.TryGet("nope", out _));
    }
}
