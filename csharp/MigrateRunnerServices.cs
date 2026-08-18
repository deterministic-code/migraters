using Microsoft.Extensions.DependencyInjection;

namespace Deterministic.MigrateRunner;

internal static class MigrateRunnerServices
{
    public static IServiceCollection AddMigrateRunner(this IServiceCollection services)
    {
        services.AddSingleton<ISqlDialect, SqliteDialect>();
        services.AddSingleton<ISqlDialect, PostgresDialect>();
        services.AddSingleton<ISqlDialect, MysqlDialect>();
        services.AddSingleton<ISqlDialectFactory, SqlDialectFactory>();
        services.AddSingleton<IConnectionResolver, ConnectionResolver>();
        services.AddSingleton<IMigrateCommand, MigrateSetup>();
        services.AddSingleton<IMigrateCommand, MigrateUp>();
        services.AddSingleton<IMigrateCommand, MigrateDown>();
        services.AddSingleton<IMigrateCommand, MigrateCreate>();
        return services;
    }
}
