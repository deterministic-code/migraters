// Subcommand dispatcher for `dotnet run -- setup|up|down|create`. Mirrors the rust runner's setup/up/down/create split (scripts/templates/create-backend-app/rust/migrate_*.rs) but folds them into one project — C# has no clean two-entry-points-per-project idiom.

using Deterministic.MigrateRunner;
using Microsoft.Extensions.DependencyInjection;

// NoClobber: real env vars win over .env, matching the ts/rust lanes.
DotNetEnv.Env.NoClobber().Load();

if (args.Length == 0)
{
    Console.Error.WriteLine("Usage: MigrateRunner <setup|up|down|create> [...]");
    return 2;
}

var services = new ServiceCollection();
services.AddMigrateRunner();
await using var provider = services.BuildServiceProvider();

var sub = args[0];
if (sub is "-h" or "--help")
{
    return PrintUsage(0);
}

var rest = args.Skip(1).ToArray();
var command = provider.GetServices<IMigrateCommand>().FirstOrDefault(c => c.Name == sub);
if (command is null)
{
    return PrintUsage(2, $"Unknown subcommand: {sub}");
}

return await command.RunAsync(rest).ConfigureAwait(false);

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
