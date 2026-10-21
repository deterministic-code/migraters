namespace Deterministic.MigrateRunner;

internal sealed class ConnectionResolver : IConnectionResolver
{
    public string? FromEnvironment(IDialect dialect) =>
        dialect
            .ConnectionEnvironmentVariables.Select(Environment.GetEnvironmentVariable)
            .FirstOrDefault(v => !string.IsNullOrEmpty(v));
}
