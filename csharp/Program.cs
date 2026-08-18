// Subcommand dispatcher for `dotnet run -- setup|up|down|create`. Mirrors the rust runner's setup/up/down/create split (scripts/templates/create-backend-app/rust/migrate_*.rs) but folds them into one project — C# has no clean two-entry-points-per-project idiom.

using Deterministic.MigrateRunner;

// NoClobber: real env vars win over .env, matching the ts/rust lanes.
DotNetEnv.Env.NoClobber().Load();

if (args.Length == 0)
{
    Console.Error.WriteLine("Usage: MigrateRunner <setup|up|down|create> [...]");
    return 2;
}

var sub = args[0];
var rest = args.Skip(1).ToArray();
return sub switch
{
    "setup" => await MigrateSetup.RunAsync(rest).ConfigureAwait(false),
    "up" => await MigrateUp.RunAsync(rest).ConfigureAwait(false),
    "down" => await MigrateDown.RunAsync(rest).ConfigureAwait(false),
    "create" => await MigrateCreate.RunAsync(rest).ConfigureAwait(false),
    "-h" or "--help" => PrintUsage(0),
    _ => PrintUsage(2, $"Unknown subcommand: {sub}"),
};

static int PrintUsage(int code, string? error = null)
{
    if (error is not null)
    {
        Console.Error.WriteLine(error);
    }
    Console.Error.WriteLine("Usage: MigrateRunner <setup|up|down|create> [...]");
    Console.Error.WriteLine("  setup  --provider <sqlite|postgres|mysql> [--connection <url>] [--migrations-path <dir>]");
    Console.Error.WriteLine("  up     --provider <sqlite|postgres|mysql> [--migrations-path <dir>] [--migrations-root <dir>] [--connection <url>] [--one]");
    Console.Error.WriteLine("  down   --provider <sqlite|postgres|mysql> [--migrations-path <dir>] [--migrations-root <dir>] [--connection <url>] [--confirm <TOKEN>]");
    Console.Error.WriteLine("  create --provider <sqlite|postgres|mysql> --name <snake_case_slug> [--migrations-path <dir>]");
    return code;
}

namespace Deterministic.MigrateRunner
{
    // Mirrors the TypeScript and rust runners' per-dialect fallback so every lane accepts the same environment.
    internal static class ConnectionEnv
    {
        public static string[] VarsFor(string provider) => provider switch
        {
            "sqlite" => new[] { "SQLITE_PATH", "DB_PATH" },
            "postgres" => new[] { "PG_CONNECTION_STRING", "DATABASE_URL" },
            "mysql" => new[] { "MYSQL_URL", "DATABASE_URL" },
            _ => Array.Empty<string>(),
        };

        public static string? For(string provider) => VarsFor(provider)
            .Select(Environment.GetEnvironmentVariable)
            .FirstOrDefault(v => !string.IsNullOrEmpty(v));
    }
}
