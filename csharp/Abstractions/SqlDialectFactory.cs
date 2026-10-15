namespace Deterministic.MigrateRunner;

internal sealed class SqlDialectFactory(IEnumerable<ISqlDialect> dialects) : ISqlDialectFactory
{
    private readonly IReadOnlyDictionary<string, ISqlDialect> _byName = dialects.ToDictionary(
        d => d.Name,
        StringComparer.Ordinal
    );

    public bool TryGet(string name, out ISqlDialect dialect)
    {
        var key = MigrateCli.NormalizeProvider(name);
        if (key is not null && _byName.TryGetValue(key, out dialect!))
            return true;
        dialect = null!;
        return false;
    }
}
