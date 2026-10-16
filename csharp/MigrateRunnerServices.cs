namespace Deterministic.MigrateRunner;

internal static class MigrateRunnerServices
{
    public static IServiceCollection AddMigrateRunner(this IServiceCollection services) =>
        services
            .AddSingleton<ISqlDialect>(SqliteDialect.Instance)
            .AddSingleton<ISqlDialect>(PostgresDialect.Instance)
            .AddSingleton<ISqlDialect>(MysqlDialect.Instance)
            .AddSingleton<ISqlDialect>(SqlServerDialect.Instance)
            .AddSingleton<ISqlDialect>(OracleDialect.Instance)
            .AddSingleton<ISqlDialectFactory, SqlDialectFactory>()
            .AddSingleton<IMigraterFactory, MigraterFactory>()
            .AddSingleton<IConnectionResolver, ConnectionResolver>()
            .AddSingleton<IMigrateCommand, MigrateSetup>()
            .AddSingleton<IMigrateCommand, MigrateUp>()
            .AddSingleton<IMigrateCommand, MigrateDown>()
            .AddSingleton<IMigrateCommand, MigrateCreate>();
}
