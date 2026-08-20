// One project, four verbs. `dotnet build` / `dotnet publish` copies the apphost to
// migrate-setup[.exe], migrate-up[.exe], … so the invocation matches the ts/rust bins.
// `dotnet MigrateRunner.dll migrate-up …` still works (verb from argv).

// NoClobber: real env vars win over .env, matching the ts/rust lanes.
DotNetEnv.Env.NoClobber().Load();

var services = new ServiceCollection();
services.AddMigrateRunner();
await using var provider = services.BuildServiceProvider();

var hostVerb = MigrateCli.VerbFromHost();
if (hostVerb is not null)
{
    var hosted = provider.GetServices<IMigrateCommand>().First(c => c.Name == hostVerb);
    return await hosted.RunAsync(args).ConfigureAwait(false);
}

if (args.Length == 0)
    return PrintUsage(2);

var sub = args[0];
if (sub is "-h" or "--help")
    return PrintUsage(0);

sub = MigrateCli.NormalizeVerb(sub);
var rest = args.Skip(1).ToArray();
var command = provider.GetServices<IMigrateCommand>().FirstOrDefault(c => c.Name == sub);
if (command is null)
    return PrintUsage(2, $"Unknown subcommand: {sub}");

return await command.RunAsync(rest).ConfigureAwait(false);

static int PrintUsage(int code, string? error = null)
{
    if (error is not null)
        Console.Error.WriteLine(error);
    Console.Error.Write(HelpTemplates.ProgramUsage());
    return code;
}
