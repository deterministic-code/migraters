namespace Deterministic.MigrateRunner;

internal sealed class ConnectionResolver : IConnectionResolver
{
    public string? FromEnvironment(ISqlDialect dialect) =>
        dialect
            .ConnectionEnvironmentVariables.Select(Environment.GetEnvironmentVariable)
            .FirstOrDefault(v => !string.IsNullOrEmpty(v));
}
