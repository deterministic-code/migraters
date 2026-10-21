using System.Reflection;

namespace Deterministic.MigrateRunner;

internal static class MigrateRunnerServices
{
    public static IServiceCollection AddMigrateRunner(this IServiceCollection services)
    {
        foreach (var dialect in LoadDialects())
            services.AddSingleton(dialect);
        return services
            .AddSingleton<ISqlDialectFactory, SqlDialectFactory>()
            .AddSingleton<IConnectionResolver, ConnectionResolver>()
            .AddSingleton<IMigrateCommand, MigrateSetup>()
            .AddSingleton<IMigrateCommand, MigrateUp>()
            .AddSingleton<IMigrateCommand, MigrateDown>()
            .AddSingleton<IMigrateCommand, MigrateCreate>();
    }

    private static IEnumerable<ISqlDialect> LoadDialects()
    {
        var dir = AppContext.BaseDirectory;
        foreach (var path in Directory.GetFiles(dir, "Migrate*.dll"))
        {
            var name = Path.GetFileNameWithoutExtension(path);
            if (name is "MigrateCore" or "MigrateRunner" or "MigrateRunner.Tests")
                continue;
            Assembly.LoadFrom(path);
        }

        return AppDomain
            .CurrentDomain.GetAssemblies()
            .SelectMany(SafeTypes)
            .Where(t => !t.ContainsGenericParameters)
            .Select(t => t.GetField("Instance", BindingFlags.Public | BindingFlags.Static))
            .Where(f =>
                f is { IsStatic: true }
                && !f.FieldType.ContainsGenericParameters
                && typeof(ISqlDialect).IsAssignableFrom(f.FieldType)
            )
            .Select(f => (ISqlDialect)f!.GetValue(null)!);
    }

    private static IEnumerable<Type> SafeTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            return ex.Types.OfType<Type>();
        }
    }
}
