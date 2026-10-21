namespace Deterministic.MigrateRunner.Tests;

public sealed class DriverYamlTests
{
    [Fact]
    public void ListsMigrationDriver()
    {
        var raw = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "driver.yaml"));
        Assert.Contains("interface: MigrationDriver", raw, StringComparison.Ordinal);
        foreach (var method in new[] { "setup", "applied", "migrateUp", "migrateDown", "logStarted", "logFinished", "close" })
            Assert.Contains($"  - {method}", raw, StringComparison.Ordinal);
    }
}
