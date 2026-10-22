using System.Reflection;

namespace Deterministic.MigrateRunner;

internal sealed class ProviderFactory : IProviderFactory
{
    private readonly IDatasourceProvider[] _all;
    private readonly IReadOnlyDictionary<string, IDatasourceProvider> _byName;

    public ProviderFactory()
    {
        var providers = LoadEnabled().ToArray();
        _all =
        [
            .. CliSpec.Providers.Select(name => providers.FirstOrDefault(p => p.Name == name))
                .OfType<IDatasourceProvider>(),
        ];
        _byName = providers.ToDictionary(p => p.Name, StringComparer.Ordinal);
    }

    public IReadOnlyList<IDatasourceProvider> All() => _all;

    public bool TryGet(string name, out IDatasourceProvider provider)
    {
        var key = MigrateCli.NormalizeProvider(name);
        if (key is not null && _byName.TryGetValue(key, out provider!))
            return true;
        provider = null!;
        return false;
    }

    private static IEnumerable<IDatasourceProvider> LoadEnabled() =>
        MigratersConfig.EnabledProviders().Select(LoadNamed);

    private static IDatasourceProvider LoadNamed(ProviderEntry entry)
    {
        var bang = entry.Location.IndexOf('!');
        if (bang <= 0)
            throw new InvalidOperationException(entry.Name);
        var dll = entry.Location[..bang];
        var typeName = entry.Location[(bang + 1)..];
        var path = Path.Combine(AppContext.BaseDirectory, dll);
        if (!File.Exists(path))
            throw new InvalidOperationException(entry.Name);
        var type = Assembly.LoadFrom(path).GetType(typeName);
        if (type is null || Activator.CreateInstance(type) is not IDatasourceProvider provider)
            throw new InvalidOperationException(entry.Name);
        return provider;
    }
}
