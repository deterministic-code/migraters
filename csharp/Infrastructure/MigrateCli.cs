namespace Deterministic.MigrateRunner;

internal static class MigrateCli
{
    internal static readonly string[] Verbs = ["setup", "up", "down", "create"];

    internal static string? VerbFromHost()
    {
        string?[] candidates = [Environment.ProcessPath, Environment.GetCommandLineArgs()[0]];
        foreach (var raw in candidates)
        {
            if (string.IsNullOrEmpty(raw))
                continue;
            var name = Path.GetFileNameWithoutExtension(raw);
            if (!name.StartsWith("migrate-", StringComparison.OrdinalIgnoreCase))
                continue;
            var verb = name["migrate-".Length..].ToLowerInvariant();
            if (Verbs.Contains(verb))
                return verb;
        }
        return null;
    }

    internal static string NormalizeVerb(string sub)
    {
        if (sub.StartsWith("migrate-", StringComparison.OrdinalIgnoreCase))
            sub = sub["migrate-".Length..];
        return sub.ToLowerInvariant();
    }
    internal static ProviderResolution ResolveProvider(
        IProviderFactory providers,
        IConnectionResolver connections,
        string provider,
        string? connection
    )
    {
        if (!providers.TryGet(provider, out var resolved))
        {
            return new ProviderResolution.Rejected(
                HelpTemplates.Message(
                    "errors/unsupported-provider",
                    new Dictionary<string, string> { ["provider"] = provider }
                )
            );
        }
        var resolvedConnection = connection ?? string.Empty;
        if (string.IsNullOrEmpty(resolvedConnection))
            resolvedConnection = connections.FromEnvironment(resolved.Name) ?? string.Empty;
        if (string.IsNullOrEmpty(resolvedConnection))
        {
            var envVars = CliSpec.ConnectionEnvironment.TryGetValue(resolved.Name, out var names)
                ? names
                : [];
            return new ProviderResolution.Rejected(
                HelpTemplates.Message(
                    "errors/missing-connection",
                    new Dictionary<string, string> { ["envVars"] = EnvVarsList(envVars) }
                )
            );
        }
        return new ProviderResolution.Ready(resolved, resolvedConnection);
    }

    internal static string MigratePath(string provider, string? migratePath, string? migrateRoot) =>
        string.IsNullOrEmpty(migratePath) ? $"{migrateRoot ?? "sql"}/{provider}/migrations" : migratePath;

    internal static bool TryTakeFlag(
        string[] args,
        ref int i,
        string current,
        string flag,
        out string value
    )
    {
        if (current == flag)
        {
            if (i + 1 >= args.Length)
            {
                value = string.Empty;
                return false;
            }
            value = args[++i];
            return true;
        }
        var eq = flag + "=";
        if (!current.StartsWith(eq, StringComparison.Ordinal))
        {
            value = string.Empty;
            return false;
        }
        value = current[eq.Length..];
        return true;
    }

    internal static string? NormalizeProvider(string raw)
    {
        var key = CliSpec.StripKey(raw);
        foreach (var provider in CliSpec.Providers)
        {
            if (CliSpec.StripKey(provider) == key)
                return provider;
        }
        return CliSpec.ProviderAliases.TryGetValue(key, out var canonical) ? canonical : null;
    }

    internal static string EnvVarsList(IEnumerable<string> vars) =>
        string.Join(CliSpec.EnvVarListSeparator, vars);

    internal static bool MissingProvider(out string error)
    {
        error = HelpTemplates.Message("errors/missing-provider");
        return false;
    }

    internal static bool MissingName(out string error)
    {
        error = HelpTemplates.Message("errors/missing-name");
        return false;
    }

    internal static bool IsValueFlag(string arg)
    {
        ReadOnlySpan<string> flags =
        [
            "--provider",
            "--connection",
            "--migrations-path",
            "--migrate-path",
            "--migrations-root",
            "--migrate-root",
            "--name",
            "--batch-separator",
        ];
        foreach (var flag in flags)
        {
            if (arg == flag || arg.StartsWith(flag + "=", StringComparison.Ordinal))
                return true;
        }
        return false;
    }

    internal static bool TryBatchSeparator(string value, out string separator, out string error)
    {
        separator = value.Trim();
        if (string.IsNullOrEmpty(separator))
        {
            error = HelpTemplates.Message("errors/empty-batch-separator");
            return false;
        }
        error = string.Empty;
        return true;
    }

    internal static string ParseArgError(string arg, bool missingValue) =>
        missingValue
            ? HelpTemplates.Message(
                "errors/missing-value-for-flag",
                new Dictionary<string, string> { ["flag"] = arg }
            )
            : HelpTemplates.Message("errors/unknown-arg", new Dictionary<string, string> { ["arg"] = arg });
}

internal abstract record ProviderResolution
{
    internal sealed record Ready(IDatasourceProvider Provider, string Connection) : ProviderResolution;

    internal sealed record Rejected(string Error) : ProviderResolution;
}
