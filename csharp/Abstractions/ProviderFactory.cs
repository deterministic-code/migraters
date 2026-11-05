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

    private static readonly Dictionary<string, (string Dll, string Type)> Types = new(StringComparer.Ordinal)
    {
        ["sqlite"] = ("MigrateSqlite.dll", "Deterministic.MigrateRunner.SqliteProvider"),
        ["postgres"] = ("MigratePostgres.dll", "Deterministic.MigrateRunner.PostgresProvider"),
        ["mysql"] = ("MigrateMysql.dll", "Deterministic.MigrateRunner.MysqlProvider"),
        ["sqlserver"] = ("MigrateSqlServer.dll", "Deterministic.MigrateRunner.SqlServerProvider"),
        ["oracle"] = ("MigrateOracle.dll", "Deterministic.MigrateRunner.OracleProvider"),
    };

    private static IDatasourceProvider LoadNamed(ProviderEntry entry)
    {
        if (!Types.TryGetValue(entry.Name, out var mapped))
            throw new InvalidOperationException(entry.Name);
        var path = Path.Combine(AppContext.BaseDirectory, mapped.Dll);
        if (!File.Exists(path))
            throw new InvalidOperationException(entry.Name);
        var type = Assembly.LoadFrom(path).GetType(mapped.Type);
        if (type is null || Activator.CreateInstance(type) is not IDatasourceProvider provider)
            throw new InvalidOperationException(entry.Name);
        return provider;
    }
}
