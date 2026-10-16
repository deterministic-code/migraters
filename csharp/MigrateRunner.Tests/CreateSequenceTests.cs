namespace Deterministic.MigrateRunner.Tests;

public sealed class CreateSequenceTests
{
    [Fact]
    public void NameAndSequenceFollowTheSpec()
    {
        Assert.True(Migrations.IsMigrationName("add_users"));
        Assert.False(Migrations.IsMigrationName("AddUsers"));
        Assert.False(Migrations.IsMigrationName("1bad"));
        Assert.Equal(1, Migrations.NextSequence([]));
        Assert.Equal(2, Migrations.NextSequence(["0001_init_up.sql"]));
        Assert.Equal(
            4,
            Migrations.NextSequence(["20240101120000_legacy_up.sql", "0003_later_up.sql"])
        );
    }
}
