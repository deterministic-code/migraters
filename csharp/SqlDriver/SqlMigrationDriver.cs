namespace Deterministic.MigrateRunner;

internal sealed class SqlMigrationDriver(DbConnection conn, SqlDialect dialect) : IMigrationDriver
{
    public async Task Setup()
    {
        await DbExecute.NonQueryAsync(conn, null, dialect.MigratesDdl).ConfigureAwait(false);
        await DbExecute.NonQueryAsync(conn, null, dialect.MigrateLogsDdl).ConfigureAwait(false);
    }

    public async Task<IReadOnlyDictionary<string, string?>> Applied() =>
        await SqlCatalog.AppliedAsync(conn, dialect).ConfigureAwait(false);

    public Task MigrateUp(string name, string body, string checksum) =>
        DbExecute.ApplyStatementsAsync(
            conn,
            dialect,
            body,
            tx =>
                DbExecute.CatalogWriteAsync(
                    conn,
                    tx,
                    dialect,
                    dialect.InsertAppliedSql,
                    ("p1", name),
                    ("p2", checksum)
                )
        );

    public Task MigrateDown(string name, string body) =>
        DbExecute.ApplyStatementsAsync(
            conn,
            dialect,
            body,
            tx =>
                DbExecute.CatalogWriteAsync(
                    conn,
                    tx,
                    dialect,
                    dialect.DeleteAppliedSql,
                    ("p1", name)
                )
        );

    public Task<long> LogStarted(string name, string direction) =>
        SqlCatalog.InsertLogStartedAsync(conn, dialect, name, direction);

    public Task LogFinished(long id, string status, long durationMs, string? error) =>
        SqlCatalog.UpdateLogAsync(conn, dialect, id, status, durationMs, error);

    public async Task Close()
    {
        await conn.DisposeAsync().ConfigureAwait(false);
    }

    public async ValueTask DisposeAsync() => await Close().ConfigureAwait(false);
}
