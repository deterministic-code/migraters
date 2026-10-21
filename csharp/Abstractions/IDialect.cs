namespace Deterministic.MigrateRunner;

public interface IDialect
{
    string Name { get; }
    IReadOnlyList<string> ConnectionEnvironmentVariables { get; }
    string NormalizeConnectionString(string connection);
    string? PrerequisiteError(string connection);
    void PrepareSetup(string connection);
    Task CreateDatabaseIfMissingAsync(string connection);
    Task<IMigrationDriver> OpenAsync(string connection);
}
