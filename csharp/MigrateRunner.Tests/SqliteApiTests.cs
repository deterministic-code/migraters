namespace Deterministic.MigrateRunner.Tests;

public sealed class SqliteApiTests
{
    [Fact]
    public async Task SetupApplyAppliedRollback()
    {
        var dialect = SqliteDialect.Instance;
        var dir = Path.Combine(Path.GetTempPath(), $"migraters-api-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        var connection = Path.Combine(dir, "app.sqlite");
        try
        {
            dialect.PrepareSetup(connection);
            await using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(connection));
            await conn.OpenAsync();
            await DbExecute.NonQueryAsync(conn, null, dialect.MigratesDdl);
            await DbExecute.NonQueryAsync(conn, null, dialect.MigrateLogsDdl);
            await DbExecute.NonQueryAsync(conn, null, dialect.MigratesDdl);

            const string sql = "CREATE TABLE t (id INTEGER);";
            var sum = Checksum.Hex(sql);
            await DbExecute.ApplyStatementsAsync(
                conn,
                dialect,
                sql,
                tx =>
                    DbExecute.CatalogWriteAsync(
                        conn,
                        tx,
                        dialect,
                        dialect.InsertAppliedSql,
                        ("p1", "0001_init"),
                        ("p2", sum)
                    )
            );
            var applied = await Migrations.AppliedChecksumsAsync(conn, dialect.SelectAppliedChecksumSql);
            Assert.Equal(sum, applied["0001_init"]);

            await DbExecute.ApplyStatementsAsync(
                conn,
                dialect,
                "DROP TABLE t;",
                tx =>
                    DbExecute.CatalogWriteAsync(
                        conn,
                        tx,
                        dialect,
                        dialect.DeleteAppliedSql,
                        ("p1", "0001_init")
                    )
            );
            applied = await Migrations.AppliedChecksumsAsync(conn, dialect.SelectAppliedChecksumSql);
            Assert.False(applied.ContainsKey("0001_init"));
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
