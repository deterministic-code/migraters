namespace Deterministic.MigrateRunner;

internal static class CreateDatabase
{
    public static Task RunAsync(IDatasourceProvider provider, string connection) =>
        provider.CreateDatabaseIfMissingAsync(connection);
}
