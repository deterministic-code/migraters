// Scaffolds a new <NNNN>_<name>_{up,down}.sql pair in the migrations directory. Numbering is max(1-4-digit prefix in dir)+1; legacy timestamp prefixes are ignored.

using System.Globalization;
using System.Text.RegularExpressions;

namespace Deterministic.MigrateRunner;

internal static class MigrateCreate
{
    private const string HelpText = @"Usage: create --provider <sqlite|postgres|mysql|sqlserver|oracle> --name <snake_case_slug> [--migrations-path <dir>]

Creates a new <NNNN>_<name>_up.sql + <NNNN>_<name>_down.sql pair scaffolded
with TODO placeholders. NNNN is one greater than the highest 1-4-digit
sequence prefix already present in the migrations directory (starts at 0001).
Legacy timestamp-prefixed filenames are ignored for numbering.

  --provider          Database dialect. Required.
  --name              snake_case slug for the new migration. Required. Must
                      match /^[a-z][a-z0-9_]*$/.
  --migrations-path   Migrations directory (default: ./sql/<dialect>/migrations).
                      Created with mkdir -p if it does not exist.

Examples:
  create --provider sqlite --name add_users
  create --provider postgres --name backfill_email_lower --migrations-path ./db/changes/postgres
";

    private static readonly Regex NameRe = new("^[a-z][a-z0-9_]*$", RegexOptions.Compiled);
    private static readonly Regex SeqRe = new(@"^(\d{1,4})_.*_up\.sql$", RegexOptions.Compiled);

    public static Task<int> RunAsync(string[] args)
    {
        if (!TryParse(args, out var provider, out var name, out var migrationsPath, out var showHelp, out var error))
        {
            if (showHelp)
            {
                Console.Error.Write(HelpText);
                return Task.FromResult(0);
            }
            Console.Error.WriteLine(error);
            Console.Error.Write(HelpText);
            return Task.FromResult(2);
        }

        var dir = migrationsPath ?? $"./sql/{provider}/migrations";
        try
        {
            Directory.CreateDirectory(dir);
            var seq = NextSequence(dir);
            var prefix = seq.ToString("D4", CultureInfo.InvariantCulture);
            var upName = $"{prefix}_{name}_up.sql";
            var downName = $"{prefix}_{name}_down.sql";
            File.WriteAllText(
                Path.Combine(dir, upName),
                $"-- TODO: write the up migration for \"{name}\"\n");
            File.WriteAllText(
                Path.Combine(dir, downName),
                $"-- TODO: write the down migration for \"{name}\"\n");
            Console.WriteLine($"Created: {upName}");
            Console.WriteLine($"Created: {downName}");
            return Task.FromResult(0);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"migrate-create failed: {ex.Message}");
            return Task.FromResult(1);
        }
    }

    private static int NextSequence(string dir)
    {
        if (!Directory.Exists(dir)) return 1;
        var max = 0;
        foreach (var path in Directory.EnumerateFiles(dir))
        {
            var fname = Path.GetFileName(path);
            var m = SeqRe.Match(fname);
            if (!m.Success) continue;
            if (int.TryParse(m.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
            {
                if (n > max) max = n;
            }
        }
        return max + 1;
    }

    private static bool TryParse(string[] args, out string provider, out string name, out string? migrationsPath, out bool showHelp, out string error)
    {
        provider = string.Empty;
        name = string.Empty;
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
                case "--name":
                    if (i + 1 >= args.Length) { error = "missing value for --name"; return false; }
                    name = args[++i];
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
        if (string.IsNullOrEmpty(name)) { error = "missing --name"; return false; }
        if (!NameRe.IsMatch(name))
        {
            error = $"--name must be snake_case: lowercase letter then [a-z0-9_] (got \"{name}\")";
            return false;
        }
        return true;
    }
}
