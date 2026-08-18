namespace Deterministic.MigrateRunner;

internal interface IMigrateCommand
{
    string Name { get; }
    Task<int> RunAsync(string[] args);
}
