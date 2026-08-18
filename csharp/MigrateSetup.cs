// Idempotent CREATE TABLE IF NOT EXISTS migrates+migrate_logs; DDL constants mirror scripts/lib/datasource-migrate.mjs:setupSql so the csharp + rust + ts runners share one migrates contract.

using System.Data.Common;
using Microsoft.Data.Sqlite;
using MySqlConnector;
using Npgsql;

namespace Deterministic.MigrateRunner;

internal static class MigrateSetup
{
    private static readonly string HelpText = HelpTemplates.Read("setup");

    public static async Task<int> RunAsync(string[] args)
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

        var resolvedMigrationsPath = migrationsPath ?? $"./sql/{provider}/migrations";

        try
        {
            switch (provider)
            {
                case "sqlite":
                    await using (var conn = new SqliteConnection(ProviderConnectionString.Sqlite(connection)))
                    {
                        await ApplyAsync(conn, SqlTemplates.Read("sqlite", "migrates"), SqlTemplates.Read("sqlite", "migrate_logs")).ConfigureAwait(false);
                    }
                    break;
                case "postgres":
                    await using (var conn = new NpgsqlConnection(ProviderConnectionString.Postgres(connection!)))
                    {
                        await ApplyAsync(conn, SqlTemplates.Read("postgres", "migrates"), SqlTemplates.Read("postgres", "migrate_logs")).ConfigureAwait(false);
                    }
                    break;
                case "mysql":
                    await using (var conn = new MySqlConnection(ProviderConnectionString.Mysql(connection!)))
                    {
                        await ApplyAsync(conn, SqlTemplates.Read("mysql", "migrates"), SqlTemplates.Read("mysql", "migrate_logs")).ConfigureAwait(false);
                    }
                    break;
                default:
                    Console.Error.WriteLine($"unsupported provider: {provider}");
                    return 2;
            }
            Directory.CreateDirectory(resolvedMigrationsPath);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"setup failed: {ex.Message}");
            return 1;
        }

        Console.WriteLine($"Setup complete: migrates and migrate_logs ready ({provider}).");
        Console.WriteLine($"Migrations directory: {resolvedMigrationsPath}");
        Console.WriteLine();
        Console.WriteLine("Next steps:");
        Console.WriteLine("  # create a new migration");
        Console.WriteLine($"  dotnet run --project MigrateRunner.csproj -- create --provider {provider} --name add_users");
        Console.WriteLine();
        Console.WriteLine("  # apply pending migrations");
        Console.WriteLine($"  dotnet run --project MigrateRunner.csproj -- up --provider {provider} --connection {connection}");
        return 0;
    }

    private static async Task ApplyAsync(DbConnection conn, string migratesDdl, string migrateLogsDdl)
    {
        await conn.OpenAsync().ConfigureAwait(false);
        await ExecuteAsync(conn, migratesDdl).ConfigureAwait(false);
        await ExecuteAsync(conn, migrateLogsDdl).ConfigureAwait(false);
    }

    private static async Task ExecuteAsync(DbConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync().ConfigureAwait(false);
    }

    private static bool TryParse(string[] args, out string provider, out string? connection, out string? migrationsPath, out bool showHelp, out string error)
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
        if (string.IsNullOrEmpty(connection))
        {
            connection = ConnectionEnv.For(provider);
        }
        if (string.IsNullOrEmpty(connection))
        {
            error = $"missing --connection — pass --connection <url> (e.g. ./app.sqlite for sqlite, or :memory: for an explicit in-memory sqlite DB) or set one of: {string.Join(", ", ConnectionEnv.VarsFor(provider))}. Run with --help for examples.";
            return false;
        }
        return true;
    }
}
