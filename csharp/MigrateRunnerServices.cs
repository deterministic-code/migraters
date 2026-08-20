namespace Deterministic.MigrateRunner;

internal static class MigrateRunnerServices
{
    public static IServiceCollection AddMigrateRunner(this IServiceCollection services) =>
        services
            .AddSingleton<ISqlDialect>(SqliteDialect.Instance)
            .AddSingleton<ISqlDialect>(PostgresDialect.Instance)
            .AddSingleton<ISqlDialect>(MysqlDialect.Instance)
            .AddSingleton<ISqlDialectFactory, SqlDialectFactory>()
            .AddSingleton<IConnectionResolver, ConnectionResolver>()
            .AddSingleton<IMigrateCommand, MigrateSetup>()
            .AddSingleton<IMigrateCommand, MigrateUp>()
            .AddSingleton<IMigrateCommand, MigrateDown>()
            .AddSingleton<IMigrateCommand, MigrateCreate>();
}
