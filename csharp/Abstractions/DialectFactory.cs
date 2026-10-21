namespace Deterministic.MigrateRunner;

internal sealed class DialectFactory(IEnumerable<IDialect> dialects) : IDialectFactory
{
    private readonly IDialect[] _all =
    [
        .. CliSpec.Providers.Select(name => dialects.FirstOrDefault(d => d.Name == name)).OfType<IDialect>(),
    ];
    private readonly IReadOnlyDictionary<string, IDialect> _byName = dialects.ToDictionary(
        d => d.Name,
        StringComparer.Ordinal
    );

    public IReadOnlyList<IDialect> All() => _all;

    public bool TryGet(string name, out IDialect dialect)
    {
        var key = MigrateCli.NormalizeProvider(name);
        if (key is not null && _byName.TryGetValue(key, out dialect!))
            return true;
        dialect = null!;
        return false;
    }
}
