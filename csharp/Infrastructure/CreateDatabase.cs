namespace Deterministic.MigrateRunner;

internal static class CreateDatabase
{
    public static Task RunAsync(ISqlDialect dialect, string connection) =>
        dialect.CreateDatabaseIfMissingAsync(connection);
}
