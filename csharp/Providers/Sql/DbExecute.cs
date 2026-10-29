namespace Deterministic.MigrateRunner;

internal static class DbExecute
{
    private static readonly Regex IsoDate = new(
        @"^\d{4}-\d{2}-\d{2}$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled
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
        SqlRun dialect,
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
        SqlRun dialect,
        string sql,
        Func<DbTransaction?, Task> catalogWrite,
        string batchSeparator = "GO"
    )
    {
        if (!dialect.UseTransaction)
        {
            foreach (var batch in SplitOnGo(sql, batchSeparator))
                await NonQueryAsync(conn, null, batch).ConfigureAwait(false);
            await catalogWrite(null).ConfigureAwait(false);
            return;
        }

        await using var tx = await conn.BeginTransactionAsync().ConfigureAwait(false);
        foreach (var batch in SplitOnGo(sql, batchSeparator))
            await NonQueryAsync(conn, tx, batch).ConfigureAwait(false);
        await catalogWrite(tx).ConfigureAwait(false);
        await tx.CommitAsync().ConfigureAwait(false);
    }

    internal static bool IsBatchSeparatorLine(string line, string separator)
    {
        var trimmed = line.Trim();
        if (trimmed.Length == 0)
            return false;
        var tokens = trimmed.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (!string.Equals(tokens[0], separator, StringComparison.OrdinalIgnoreCase))
            return false;
        if (tokens.Length == 1)
            return true;
        if (tokens[1].StartsWith("--", StringComparison.Ordinal))
            return true;
        return IsoDate.IsMatch(tokens[1])
            && (tokens.Length == 2 || tokens[2].StartsWith("--", StringComparison.Ordinal));
    }

    internal static List<string> SplitOnGo(string sql, string separator = "GO")
    {
        var batches = new List<string>();
        var buf = new StringBuilder();
        foreach (var line in sql.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            if (IsBatchSeparatorLine(line, separator))
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
