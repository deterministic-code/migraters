namespace Deterministic.MigrateRunner;

internal interface IDialectFactory
{
    bool TryGet(string name, out IDialect dialect);
    IReadOnlyList<IDialect> All();
}
