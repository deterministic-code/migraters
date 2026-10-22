namespace Deterministic.MigrateRunner;

internal static class MigrateRunnerServices
{
    public static IServiceCollection AddMigrateRunner(this IServiceCollection services) =>
        services
            .AddSingleton<IProviderFactory, ProviderFactory>()
            .AddSingleton<IConnectionResolver, ConnectionResolver>()
            .AddSingleton<IMigrateCommand, MigrateSetup>()
            .AddSingleton<IMigrateCommand, MigrateUp>()
            .AddSingleton<IMigrateCommand, MigrateDown>()
            .AddSingleton<IMigrateCommand, MigrateCreate>();
}
