namespace Deterministic.MigrateRunner;

internal static class MigrateRunnerServices
{
    public static IServiceCollection AddMigrateRunner(this IServiceCollection services)
    {
        var builder = services;
#if DIALECT_SQLITE
        builder = builder.AddSingleton<ISqlDialect>(SqliteDialect.Instance);
#endif
#if DIALECT_POSTGRES
        builder = builder.AddSingleton<ISqlDialect>(PostgresDialect.Instance);
#endif
#if DIALECT_MYSQL
        builder = builder.AddSingleton<ISqlDialect>(MysqlDialect.Instance);
#endif
#if DIALECT_SQLSERVER
        builder = builder.AddSingleton<ISqlDialect>(SqlServerDialect.Instance);
#endif
#if DIALECT_ORACLE
        builder = builder.AddSingleton<ISqlDialect>(OracleDialect.Instance);
#endif
        return builder
            .AddSingleton<ISqlDialectFactory, SqlDialectFactory>()
            .AddSingleton<IConnectionResolver, ConnectionResolver>()
            .AddSingleton<IMigrateCommand, MigrateSetup>()
            .AddSingleton<IMigrateCommand, MigrateUp>()
            .AddSingleton<IMigrateCommand, MigrateDown>()
            .AddSingleton<IMigrateCommand, MigrateCreate>();
    }
}
