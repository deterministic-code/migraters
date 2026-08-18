namespace Deterministic.MigrateRunner;

internal interface ISqlDialectFactory
{
    bool TryGet(string name, out ISqlDialect dialect);
}
