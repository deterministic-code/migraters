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
    internal static bool TryResolveProvider(
        ISqlDialectFactory dialects,
        IConnectionResolver connections,
        string provider,
        string? connection,
        out ISqlDialect dialect,
        out string resolvedConnection,
        out string error
    )
    {
        dialect = null!;
        resolvedConnection = connection ?? string.Empty;
        error = string.Empty;
        if (!dialects.TryGet(provider, out dialect))
            return Fail(
                HelpTemplates.Message(
                    "errors/unsupported-provider",
                    new Dictionary<string, string> { ["provider"] = provider }
                ),
                out error
            );
        if (string.IsNullOrEmpty(resolvedConnection))
            resolvedConnection = connections.FromEnvironment(dialect) ?? string.Empty;
        if (string.IsNullOrEmpty(resolvedConnection))
        {
            return Fail(
                HelpTemplates.Message(
                    "errors/missing-connection",
                    new Dictionary<string, string>
                    {
                        ["envVars"] = EnvVarsList(dialect.ConnectionEnvironmentVariables),
                    }
                ),
                out error
            );
        }
        return true;
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

    internal static bool MissingValue(string flag, out string error)
    {
        error = HelpTemplates.Message(
            "errors/missing-value-for-flag",
            new Dictionary<string, string> { ["flag"] = flag }
        );
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
            "--confirm",
        ];
        foreach (var flag in flags)
        {
            if (arg == flag || arg.StartsWith(flag + "=", StringComparison.Ordinal))
                return true;
        }
        return false;
    }

    internal static string ParseArgError(string arg, bool missingValue) =>
        missingValue
            ? HelpTemplates.Message(
                "errors/missing-value-for-flag",
                new Dictionary<string, string> { ["flag"] = arg }
            )
            : HelpTemplates.Message("errors/unknown-arg", new Dictionary<string, string> { ["arg"] = arg });

    private static bool Fail(string message, out string error)
    {
        error = message;
        return false;
    }
}
