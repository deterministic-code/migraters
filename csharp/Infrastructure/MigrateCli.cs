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
                        ["envVars"] = string.Join(", ", dialect.ConnectionEnvironmentVariables),
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
        value = string.Empty;
        if (current != flag)
            return false;
        if (i + 1 >= args.Length)
            return false;
        value = args[++i];
        return true;
    }

    internal static bool MissingValue(string flag, out string error)
    {
        error = HelpTemplates.Message(
            "errors/missing-value-for-flag",
            new Dictionary<string, string> { ["flag"] = flag }
        );
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
