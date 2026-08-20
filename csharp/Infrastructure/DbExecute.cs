namespace Deterministic.MigrateRunner;

internal static class DbExecute
{
    private static readonly Regex GoLine = new(
        @"^\s*GO\s*$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled
    );

    public static async Task NonQueryAsync(DbConnection conn, DbTransaction? tx, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        if (tx is not null)
            cmd.Transaction = tx;
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
    }

    public static async Task CatalogWriteAsync(
        DbConnection conn,
        DbTransaction? tx,
        ISqlDialect dialect,
        string sql,
        params (string name, object value)[] parameters
    )
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        if (tx is not null)
            cmd.Transaction = tx;
        foreach (var (name, value) in parameters)
            dialect.AddParameter(cmd, name, value);
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
    }

    public static async Task ApplyStatementsAsync(
        DbConnection conn,
        ISqlDialect dialect,
        string sql,
        Func<DbTransaction?, Task> catalogWrite
    )
    {
        if (!dialect.UseTransaction)
        {
            foreach (var batch in SplitOnGo(sql))
                await NonQueryAsync(conn, null, batch).ConfigureAwait(false);
            await catalogWrite(null).ConfigureAwait(false);
            return;
        }

        await using var tx = await conn.BeginTransactionAsync().ConfigureAwait(false);
        foreach (var batch in SplitOnGo(sql))
            await NonQueryAsync(conn, tx, batch).ConfigureAwait(false);
        await catalogWrite(tx).ConfigureAwait(false);
        await tx.CommitAsync().ConfigureAwait(false);
    }

    internal static List<string> SplitOnGo(string sql)
    {
        var batches = new List<string>();
        var buf = new StringBuilder();
        foreach (var line in sql.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            if (GoLine.IsMatch(line))
            {
                var s = buf.ToString().Trim();
                if (s.Length > 0)
                    batches.Add(s);
                buf.Clear();
                continue;
            }
            if (buf.Length > 0)
                buf.Append('\n');
            buf.Append(line);
        }
        var tail = buf.ToString().Trim();
        if (tail.Length > 0)
            batches.Add(tail);
        return batches;
    }
}
