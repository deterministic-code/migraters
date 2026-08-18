namespace Deterministic.MigrateRunner;

internal static class SqlTemplates
{
    public static string Read(string dialect, string name)
    {
        var path = Path.Combine(
            AppContext.BaseDirectory,
            "templates",
            "sql",
            dialect,
            $"{name}.sql");
        return File.ReadAllText(path).Trim();
    }
}
