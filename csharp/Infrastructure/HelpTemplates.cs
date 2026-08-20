namespace Deterministic.MigrateRunner;

internal static class HelpTemplates
{
    internal const string SupportedProviders = "sqlite|postgres|mysql|sqlserver|oracle";

    private const string CommandPlaceholder = "{{command}}";

    public static string ProgramUsage() => CliSpec.ProgramUsage();

    public static string Read(string verb)
    {
        var command = ToCommand(verb);
        var verbName = command.StartsWith("migrate-", StringComparison.Ordinal)
            ? command["migrate-".Length..]
            : command;
        return Fill(
            ReadRaw("help", verbName),
            new Dictionary<string, string> { ["command"] = command, ["usage"] = CliSpec.UsageLine(verbName) }
        );
    }

    public static string Message(string relativePath, IReadOnlyDictionary<string, string>? vars = null) =>
        Fill(ReadRaw("messages", relativePath), vars);

    public static string Scaffold(string name, IReadOnlyDictionary<string, string> vars) =>
        Fill(
            File.ReadAllText(
                Path.Combine(AppContext.BaseDirectory, "templates", "scaffold", $"{name}.sql")
            ),
            vars
        );

    public static string Fill(string template, string command) =>
        Fill(template, new Dictionary<string, string> { [CommandPlaceholder.Trim('{', '}')] = command });

    public static string Fill(string template, IReadOnlyDictionary<string, string>? vars)
    {
        if (vars is null || vars.Count == 0)
            return template;
        var result = template;
        foreach (var (key, value) in vars)
            result = result.Replace($"{{{{{key}}}}}", value, StringComparison.Ordinal);
        return result;
    }

    private static string ToCommand(string verb) =>
        verb.StartsWith("migrate-", StringComparison.Ordinal) ? verb : $"migrate-{verb}";

    private static string ReadRaw(string category, string name) =>
        File.ReadAllText(
            Path.Combine(AppContext.BaseDirectory, "templates", category, $"{name}.txt")
        );
}
