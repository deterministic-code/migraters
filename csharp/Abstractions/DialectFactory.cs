using System.Reflection;

namespace Deterministic.MigrateRunner;

internal sealed class DialectFactory : IDialectFactory
{
    private readonly IDialect[] _all;
    private readonly IReadOnlyDictionary<string, IDialect> _byName;

    public DialectFactory()
    {
        var dialects = LoadEnabled().ToArray();
        _all =
        [
            .. CliSpec.Providers.Select(name => dialects.FirstOrDefault(d => d.Name == name)).OfType<IDialect>(),
        ];
        _byName = dialects.ToDictionary(d => d.Name, StringComparer.Ordinal);
    }

    public IReadOnlyList<IDialect> All() => _all;

    public bool TryGet(string name, out IDialect dialect)
    {
        var key = MigrateCli.NormalizeProvider(name);
        if (key is not null && _byName.TryGetValue(key, out dialect!))
            return true;
        dialect = null!;
        return false;
    }

    private static IEnumerable<IDialect> LoadEnabled() =>
        MigratersConfig.EnabledDialects().Select(LoadNamed);

    private static IDialect LoadNamed(string raw)
    {
        var name = MigrateCli.NormalizeProvider(raw) ?? raw;
        var dll = name switch
        {
            "sqlite" => "MigrateSqlite.dll",
            "postgres" => "MigratePostgres.dll",
            "mysql" => "MigrateMysql.dll",
            "sqlserver" => "MigrateSqlServer.dll",
            "oracle" => "MigrateOracle.dll",
            _ => throw new InvalidOperationException(name),
        };
        var path = Path.Combine(AppContext.BaseDirectory, dll);
        if (!File.Exists(path))
            throw new InvalidOperationException(name);
        var assembly = Assembly.LoadFrom(path);
        foreach (var type in assembly.GetExportedTypes())
        {
            var field = type.GetField("Instance", BindingFlags.Public | BindingFlags.Static);
            if (field is { IsStatic: true } && typeof(IDialect).IsAssignableFrom(field.FieldType))
                return (IDialect)field.GetValue(null)!;
        }
        throw new InvalidOperationException(name);
    }
}
