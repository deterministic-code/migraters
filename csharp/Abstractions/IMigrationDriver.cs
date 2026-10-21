namespace Deterministic.MigrateRunner;

public interface IMigrationDriver : IAsyncDisposable
{
    Task Setup();
    Task<IReadOnlyDictionary<string, string?>> Applied();
    Task MigrateUp(string name, string body, string checksum);
    Task MigrateDown(string name, string body);
    Task<long> LogStarted(string name, string direction);
    Task LogFinished(long id, string status, long durationMs, string? error);
    Task Close();
}
