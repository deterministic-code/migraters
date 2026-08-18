// Idempotent CREATE TABLE IF NOT EXISTS migrates+migrate_logs; DDL constants mirror scripts/lib/datasource-migrate.mjs:setupSql so the csharp + rust + ts runners share one migrates contract.

namespace Deterministic.MigrateRunner;

internal sealed class MigrateSetup : IMigrateCommand
{
    private static readonly string HelpText = HelpTemplates.Read("setup");

    private readonly ISqlDialectFactory _dialects;
    private readonly IConnectionResolver _connections;

    public MigrateSetup(ISqlDialectFactory dialects, IConnectionResolver connections)
    {
        _dialects = dialects;
        _connections = connections;
    }

    public string Name => "setup";

    public async Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var connection, out var migrationsPath, out var showHelp, out var error))
        {
            if (showHelp)
            {
                Console.Error.Write(HelpText);
                return 0;
            }
            Console.Error.WriteLine(error);
            Console.Error.Write(HelpText);
            return 2;
        }

        if (!_dialects.TryGet(provider, out var dialect))
        {
            Console.Error.WriteLine($"unsupported provider: {provider}");
            return 2;
        }

        var resolvedMigrationsPath = migrationsPath ?? $"./sql/{dialect.Name}/migrations";

        try
        {
            await using var conn = dialect.CreateConnection(dialect.NormalizeConnectionString(connection!));
            await conn.OpenAsync().ConfigureAwait(false);
            await DbExecute.NonQueryAsync(conn, null, dialect.MigratesDdl).ConfigureAwait(false);
            await DbExecute.NonQueryAsync(conn, null, dialect.MigrateLogsDdl).ConfigureAwait(false);
            Directory.CreateDirectory(resolvedMigrationsPath);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"setup failed: {ex.Message}");
            return 1;
        }

        Console.WriteLine($"Setup complete: migrates and migrate_logs ready ({dialect.Name}).");
        Console.WriteLine($"Migrations directory: {resolvedMigrationsPath}");
        Console.WriteLine();
        Console.WriteLine("Next steps:");
        Console.WriteLine("  # create a new migration");
        Console.WriteLine($"  dotnet run --project MigrateRunner.csproj -- create --provider {dialect.Name} --name add_users");
        Console.WriteLine();
        Console.WriteLine("  # apply pending migrations");
        Console.WriteLine($"  dotnet run --project MigrateRunner.csproj -- up --provider {dialect.Name} --connection {connection}");
        return 0;
    }

    private bool TryParse(string[] args, out string provider, out string? connection, out string? migrationsPath, out bool showHelp, out string error)
    {
        provider = string.Empty;
        connection = null;
        migrationsPath = null;
        showHelp = false;
        error = string.Empty;
        for (var i = 0; i < args.Length; i++)
        {
            var a = args[i];
            switch (a)
            {
                case "--provider":
                    if (i + 1 >= args.Length) { error = "missing value for --provider"; return false; }
                    provider = args[++i];
                    break;
                case "--connection":
                    if (i + 1 >= args.Length) { error = "missing value for --connection"; return false; }
                    connection = args[++i];
                    break;
                // --migrate-path is a silent alias retained for backward compat.
                case "--migrations-path":
                case "--migrate-path":
                    if (i + 1 >= args.Length) { error = $"missing value for {a}"; return false; }
                    migrationsPath = args[++i];
                    break;
                case "-h":
                case "--help":
                    showHelp = true;
                    return false;
                default:
                    error = $"unknown arg: {a}";
                    return false;
            }
        }
        if (string.IsNullOrEmpty(provider)) { error = "missing --provider"; return false; }
        _dialects.TryGet(provider, out var dialect);
        if (string.IsNullOrEmpty(connection) && dialect is not null)
        {
            connection = _connections.FromEnvironment(dialect);
        }
        if (string.IsNullOrEmpty(connection))
        {
            var vars = dialect?.ConnectionEnvironmentVariables ?? Array.Empty<string>();
            error = $"missing --connection — pass --connection <url> (e.g. ./app.sqlite for sqlite, or :memory: for an explicit in-memory sqlite DB) or set one of: {string.Join(", ", vars)}. Run with --help for examples.";
            return false;
        }
        return true;
    }
}
