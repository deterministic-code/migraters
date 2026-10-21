namespace Deterministic.MigrateRunner;

internal sealed class SqlDialectFactory(IEnumerable<ISqlDialect> dialects) : ISqlDialectFactory
{
    private readonly ISqlDialect[] _all =
    [
        .. CliSpec.Providers.Select(name => dialects.FirstOrDefault(d => d.Name == name)).OfType<ISqlDialect>(),
    ];
    private readonly IReadOnlyDictionary<string, ISqlDialect> _byName = dialects.ToDictionary(
        d => d.Name,
        StringComparer.Ordinal
    );

    public IReadOnlyList<ISqlDialect> All() => _all;

    public bool TryGet(string name, out ISqlDialect dialect)
    {
        var key = MigrateCli.NormalizeProvider(name);
        if (key is not null && _byName.TryGetValue(key, out dialect!))
            return true;
        dialect = null!;
        return false;
    }
}
