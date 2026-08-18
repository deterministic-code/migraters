using System.Data.Common;

namespace Deterministic.MigrateRunner;

internal static class DbExecute
{
    public static async Task NonQueryAsync(DbConnection conn, DbTransaction? tx, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        if (tx is not null)
        {
            cmd.Transaction = tx;
        }
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
    }

    public static async Task CatalogWriteAsync(
        DbConnection conn,
        DbTransaction? tx,
        ISqlDialect dialect,
        string sql,
        params (string name, object value)[] parameters)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        if (tx is not null)
        {
            cmd.Transaction = tx;
        }
        foreach (var (name, value) in parameters)
        {
            dialect.AddParameter(cmd, name, value);
        }
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
    }

    public static async Task ApplyStatementsAsync(
        DbConnection conn,
        ISqlDialect dialect,
        string sql,
        Func<DbTransaction?, Task> catalogWrite)
    {
        if (!dialect.UseTransaction)
        {
            foreach (var stmt in SqlStatementSplitter.Split(sql))
            {
                await NonQueryAsync(conn, null, stmt).ConfigureAwait(false);
            }
            await catalogWrite(null).ConfigureAwait(false);
            return;
        }

        await using var tx = await conn.BeginTransactionAsync().ConfigureAwait(false);
        foreach (var stmt in SqlStatementSplitter.Split(sql))
        {
            await NonQueryAsync(conn, tx, stmt).ConfigureAwait(false);
        }
        await catalogWrite(tx).ConfigureAwait(false);
        await tx.CommitAsync().ConfigureAwait(false);
    }
}
