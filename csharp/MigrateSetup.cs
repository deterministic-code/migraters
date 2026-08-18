// Idempotent CREATE TABLE IF NOT EXISTS migrates+migrate_logs; DDL constants mirror scripts/lib/datasource-migrate.mjs:setupSql so the csharp + rust + ts runners share one migrates contract.

using System.Data.Common;
using Microsoft.Data.Sqlite;
using MySqlConnector;
using Npgsql;

namespace Deterministic.MigrateRunner;

internal static class MigrateSetup
{
    private const string SqliteMigratesDdl = @"CREATE TABLE IF NOT EXISTS ""migrates"" (
      ""id"" INTEGER PRIMARY KEY AUTOINCREMENT,
      ""name"" VARCHAR(255) NOT NULL UNIQUE,
      ""checksum"" VARCHAR(64),
      ""created"" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ""updated"" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );";

    private const string SqliteMigrateLogsDdl = @"CREATE TABLE IF NOT EXISTS ""migrate_logs"" (
      ""id"" INTEGER PRIMARY KEY AUTOINCREMENT,
      ""migrate_name"" VARCHAR(255) NOT NULL,
      ""direction"" VARCHAR(8) NOT NULL,
      ""status"" VARCHAR(16) NOT NULL,
      ""finished_at"" DATETIME,
      ""duration_ms"" INTEGER,
      ""error_message"" TEXT,
      ""created"" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ""updated"" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );";

    private const string PostgresMigratesDdl = @"CREATE TABLE IF NOT EXISTS ""migrates"" (
      ""id"" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ""name"" VARCHAR(255) NOT NULL UNIQUE,
      ""checksum"" VARCHAR(64),
      ""created"" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ""updated"" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );";

    private const string PostgresMigrateLogsDdl = @"CREATE TABLE IF NOT EXISTS ""migrate_logs"" (
      ""id"" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ""migrate_name"" VARCHAR(255) NOT NULL,
      ""direction"" VARCHAR(8) NOT NULL,
      ""status"" VARCHAR(16) NOT NULL,
      ""finished_at"" TIMESTAMPTZ,
      ""duration_ms"" INTEGER,
      ""error_message"" TEXT,
      ""created"" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ""updated"" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );";

    private const string MysqlMigratesDdl = @"CREATE TABLE IF NOT EXISTS `migrates` (
      `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
      `name` VARCHAR(255) NOT NULL UNIQUE,
      `checksum` VARCHAR(64),
      `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updated` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );";

    private const string MysqlMigrateLogsDdl = @"CREATE TABLE IF NOT EXISTS `migrate_logs` (
      `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
      `migrate_name` VARCHAR(255) NOT NULL,
      `direction` VARCHAR(8) NOT NULL,
      `status` VARCHAR(16) NOT NULL,
      `finished_at` TIMESTAMP NULL,
      `duration_ms` INT,
      `error_message` TEXT,
      `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updated` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );";

    private const string HelpText = @"Usage: setup --provider <sqlite|postgres|mysql> --connection <url> [--migrations-path <dir>]

Creates the bookkeeping tables (migrates, migrate_logs) for the chosen dialect
and the migrations directory (mkdir -p). Idempotent — re-running against an
already-setup database is a no-op.

  --provider          Database dialect. Required.
  --connection        Connection string. Falls back to per-dialect env vars (loaded from ./.env when present) if omitted.
  --migrations-path   Migrations directory (default: ./sql/<dialect>/migrations).

Examples:
  # sqlite — bare path or sqlite:// URL; both create a file on disk.
  setup --provider sqlite --connection ./app.sqlite
  setup --provider sqlite --connection sqlite:///absolute/path/app.sqlite

  # postgres — URL or keyword form.
  setup --provider postgres --connection postgresql://user:pass@host:5432/dbname
  setup --provider postgres --connection ""Host=host;Port=5432;Username=user;Password=pass;Database=dbname""

  # mysql — URL or keyword form.
  setup --provider mysql --connection mysql://user:pass@host:3306/dbname
  setup --provider mysql --connection ""Server=host;Port=3306;User Id=user;Password=pass;Database=dbname""

  # explicit in-memory sqlite (was previously the silent default — now you must opt in):
  setup --provider sqlite --connection :memory:

Note: when --connection is omitted, ./.env is loaded (if present) and the
runner falls back to per-dialect env vars — sqlite: SQLITE_PATH, DB_PATH;
postgres: PG_CONNECTION_STRING, DATABASE_URL; mysql: MYSQL_URL, DATABASE_URL.
";

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
                        await ApplyAsync(conn, SqliteMigratesDdl, SqliteMigrateLogsDdl).ConfigureAwait(false);
                    }
                    break;
                case "postgres":
                    await using (var conn = new NpgsqlConnection(ProviderConnectionString.Postgres(connection!)))
                    {
                        await ApplyAsync(conn, PostgresMigratesDdl, PostgresMigrateLogsDdl).ConfigureAwait(false);
                    }
                    break;
                case "mysql":
                    await using (var conn = new MySqlConnection(ProviderConnectionString.Mysql(connection!)))
                    {
                        await ApplyAsync(conn, MysqlMigratesDdl, MysqlMigrateLogsDdl).ConfigureAwait(false);
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
