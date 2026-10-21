namespace Deterministic.MigrateRunner;

internal interface IConnectionResolver
{
    string? FromEnvironment(IDialect dialect);
}
