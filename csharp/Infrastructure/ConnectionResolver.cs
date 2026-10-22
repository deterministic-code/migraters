namespace Deterministic.MigrateRunner;

internal sealed class ConnectionResolver : IConnectionResolver
{
    public string? FromEnvironment(string provider) =>
        CliSpec.ConnectionEnvironment.TryGetValue(provider, out var names)
            ? names.Select(Environment.GetEnvironmentVariable).FirstOrDefault(v => !string.IsNullOrEmpty(v))
            : null;
}
