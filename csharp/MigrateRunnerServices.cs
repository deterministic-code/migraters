using System.Reflection;

namespace Deterministic.MigrateRunner;

internal static class MigrateRunnerServices
{
    public static IServiceCollection AddMigrateRunner(this IServiceCollection services)
    {
        foreach (var dialect in LoadDialects())
            services.AddSingleton(dialect);
        return services
            .AddSingleton<IDialectFactory, DialectFactory>()
            .AddSingleton<IConnectionResolver, ConnectionResolver>()
            .AddSingleton<IMigrateCommand, MigrateSetup>()
            .AddSingleton<IMigrateCommand, MigrateUp>()
            .AddSingleton<IMigrateCommand, MigrateDown>()
            .AddSingleton<IMigrateCommand, MigrateCreate>();
    }

    private static IEnumerable<IDialect> LoadDialects()
    {
        var dir = AppContext.BaseDirectory;
        foreach (var path in Directory.GetFiles(dir, "Migrate*.dll"))
        {
            var name = Path.GetFileNameWithoutExtension(path);
            if (name is "MigrateCore" or "MigrateRunner" or "MigrateRunner.Tests" or "MigrateSqlDriver")
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
                && typeof(IDialect).IsAssignableFrom(f.FieldType)
            )
            .Select(f => (IDialect)f!.GetValue(null)!);
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
