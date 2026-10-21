namespace Deterministic.MigrateRunner;

internal static class SqlCatalog
{
    public static async Task<Dictionary<string, string?>> AppliedAsync(DbConnection conn, SqlDialect dialect)
    {
        var map = new Dictionary<string, string?>(StringComparer.Ordinal);
        using var cmd = conn.CreateCommand();
        cmd.CommandText = dialect.SelectAppliedChecksumSql;
        using var reader = await cmd.ExecuteReaderAsync().ConfigureAwait(false);
        while (await reader.ReadAsync().ConfigureAwait(false))
        {
            var name = Migrations.CatalogName(reader.GetString(0));
            var checksum = reader.IsDBNull(1) ? null : reader.GetString(1);
            map[name] = checksum;
        }
        return map;
    }

    public static async Task<long> InsertLogStartedAsync(
        DbConnection conn,
        SqlDialect dialect,
        string name,
        string direction
    )
    {
        var t = dialect.QuoteIdent("migrate_logs");
        var insert =
            $"INSERT INTO {t} ({dialect.QuoteIdent("migrate_name")}, {dialect.QuoteIdent("direction")}, {dialect.QuoteIdent("status")}) VALUES ({dialect.Placeholder("p1")}, {dialect.Placeholder("p2")}, 'started')";
        await DbExecute.CatalogWriteAsync(conn, null, dialect, insert, ("p1", name), ("p2", direction))
            .ConfigureAwait(false);

        var select =
            $"SELECT {dialect.QuoteIdent("id")} AS id FROM {t} WHERE {dialect.QuoteIdent("migrate_name")} = {dialect.Placeholder("p1")} AND {dialect.QuoteIdent("direction")} = {dialect.Placeholder("p2")} ORDER BY {dialect.QuoteIdent("id")} DESC {dialect.LimitClause(1)}";
        using var cmd = conn.CreateCommand();
        cmd.CommandText = select;
        dialect.AddParameter(cmd, "p1", name);
        dialect.AddParameter(cmd, "p2", direction);
        var value = await cmd.ExecuteScalarAsync().ConfigureAwait(false);
        return Convert.ToInt64(value, CultureInfo.InvariantCulture);
    }

    public static async Task UpdateLogAsync(
        DbConnection conn,
        SqlDialect dialect,
        long id,
        string status,
        long durationMs,
        string? errorMessage
    )
    {
        var t = dialect.QuoteIdent("migrate_logs");
        var now = dialect.NowExpr;
        var sql =
            $"UPDATE {t} SET {dialect.QuoteIdent("status")} = {dialect.Placeholder("p1")}, {dialect.QuoteIdent("finished_at")} = {now}, {dialect.QuoteIdent("duration_ms")} = {dialect.Placeholder("p2")}, {dialect.QuoteIdent("error_message")} = {dialect.Placeholder("p3")}, {dialect.QuoteIdent("updated")} = {now} WHERE {dialect.QuoteIdent("id")} = {dialect.Placeholder("p4")}";
        await DbExecute
            .CatalogWriteAsync(
                conn,
                null,
                dialect,
                sql,
                ("p1", status),
                ("p2", durationMs),
                ("p3", (object?)errorMessage ?? DBNull.Value),
                ("p4", id)
            )
            .ConfigureAwait(false);
    }
}
