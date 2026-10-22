namespace Deterministic.MigrateRunner.Tests;

public sealed class DriverYamlTests
{
    [Fact]
    public void ListsDatasourceProvider()
    {
        var raw = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "driver.yaml"));
        Assert.Contains("interface: IDatasourceProvider", raw, StringComparison.Ordinal);
        foreach (var method in new[] { "setup", "applied", "migrateUp", "migrateDown", "log" })
            Assert.Contains($"  - {method}", raw, StringComparison.Ordinal);
    }
}
