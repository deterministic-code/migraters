namespace Deterministic.MigrateRunner;

internal interface IConnectionResolver
{
    string? FromEnvironment(ISqlDialect dialect);
}
