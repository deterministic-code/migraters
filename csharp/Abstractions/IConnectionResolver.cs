namespace Deterministic.MigrateRunner;

internal interface IConnectionResolver
{
    string? FromEnvironment(string provider);
}
