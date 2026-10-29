namespace Deterministic.MigrateRunner;

public interface IDatasourceProvider
{
    string Name { get; }
    void PrepareSetup(string connection);
    Task CreateDatabaseIfMissingAsync(string connection);
    Task Setup(string connection);
    Task<IReadOnlyDictionary<string, string?>> Applied(string connection);
    Task MigrateUp(string connection, string name, string body, string checksum, string batchSeparator = "GO");
    Task MigrateDown(string connection, string name, string body, string batchSeparator = "GO");
    Task<long> Log(
        string connection,
        long? id,
        string name,
        string direction,
        string? status,
        long durationMs,
        string? error
    );
}
