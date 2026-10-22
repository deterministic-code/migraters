namespace Deterministic.MigrateRunner;

internal interface IProviderFactory
{
    bool TryGet(string name, out IDatasourceProvider provider);
    IReadOnlyList<IDatasourceProvider> All();
}
