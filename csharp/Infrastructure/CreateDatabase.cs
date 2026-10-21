namespace Deterministic.MigrateRunner;

internal static class CreateDatabase
{
    public static Task RunAsync(IDialect dialect, string connection) =>
        dialect.CreateDatabaseIfMissingAsync(connection);
}
