namespace Deterministic.MigrateRunner;

internal sealed class SqlDialectFactory : ISqlDialectFactory
{
    private readonly IReadOnlyDictionary<string, ISqlDialect> _byName;

    public SqlDialectFactory(IEnumerable<ISqlDialect> dialects)
    {
        _byName = dialects.ToDictionary(d => d.Name, StringComparer.Ordinal);
    }

    public bool TryGet(string name, out ISqlDialect dialect) =>
        _byName.TryGetValue(name, out dialect!);
}
