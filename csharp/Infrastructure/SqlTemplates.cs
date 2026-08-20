namespace Deterministic.MigrateRunner;

internal static class SqlTemplates
{
    public static string Read(string dialect, string name) =>
        File.ReadAllText(
                Path.Combine(AppContext.BaseDirectory, "templates", "sql", dialect, $"{name}.sql")
            )
            .Trim();
}
