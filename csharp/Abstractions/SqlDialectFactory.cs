namespace Deterministic.MigrateRunner;

internal sealed class SqlDialectFactory(IEnumerable<ISqlDialect> dialects) : ISqlDialectFactory
{
    private readonly IReadOnlyDictionary<string, ISqlDialect> _byName = dialects.ToDictionary(
        d => d.Name,
        StringComparer.Ordinal
    );

    public bool TryGet(string name, out ISqlDialect dialect) =>
        _byName.TryGetValue(name, out dialect!);
}
