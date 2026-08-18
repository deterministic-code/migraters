namespace Deterministic.MigrateRunner;

internal static class HelpTemplates
{
    public static string Read(string verb)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "templates", "help", $"{verb}.txt");
        var command = verb.StartsWith("migrate-", StringComparison.Ordinal)
            ? verb
            : $"migrate-{verb}";
        return File.ReadAllText(path).Replace("{{command}}", command, StringComparison.Ordinal);
    }
}
