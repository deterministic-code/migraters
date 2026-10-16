namespace Deterministic.MigrateRunner.Tests;

public sealed class DiscoveryTests
{
    [Fact]
    public void MissingDirectoryUsesSharedError()
    {
        var path = Path.Combine(Path.GetTempPath(), "does-not-exist-migrate");
        var ex = Assert.Throws<DirectoryNotFoundException>(() => Migrations.OrderedUpFiles(path));
        Assert.Contains("migrate-path is not a directory", ex.Message, StringComparison.Ordinal);
    }
}
