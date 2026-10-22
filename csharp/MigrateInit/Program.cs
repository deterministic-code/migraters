using System.Text;

var parsed = ParseArgs(args);
if (parsed.Help)
{
    Console.Error.Write(HelpText());
    return 0;
}

if (parsed.Error is not null)
{
    Console.Error.Write(parsed.Error);
    return parsed.ExitCode;
}

if (parsed.Language is not null && parsed.Language != "csharp")
{
    Console.Error.Write($"unsupported language: {parsed.Language}\n");
    return 2;
}

var dialects = ResolveDialects(parsed);
if (dialects.Error is not null)
{
    Console.Error.Write(dialects.Error);
    return dialects.ExitCode;
}

var csharpDir = FindCSharpRoot();
if (csharpDir is null)
{
    Console.Error.WriteLine("could not find MigrateRunner.csproj");
    return 1;
}

var propsPath = Path.Combine(csharpDir, "dialects.props");
File.WriteAllText(propsPath, RenderProps(dialects.Names));
Console.WriteLine($"Enabled dialects: {string.Join(", ", dialects.Names)}");
Console.WriteLine($"Wrote {propsPath}");
return 0;

static Parsed ParseArgs(string[] args)
{
    var dialects = new List<string>();
    string? language = null;
    var all = false;
    for (var i = 0; i < args.Length; i++)
    {
        var arg = args[i];
        if (arg is "-h" or "--help")
            return new Parsed(true, false, dialects, null, null, 0);
        if (arg == "--all")
        {
            all = true;
            continue;
        }
        if (arg == "--language")
        {
            if (i + 1 >= args.Length)
                return new Parsed(false, false, dialects, null, "unknown arg: --language\n", 2);
            language = NormalizeKey(args[++i]);
            continue;
        }
        if (arg.StartsWith("--language=", StringComparison.Ordinal))
        {
            language = NormalizeKey(arg["--language=".Length..]);
            continue;
        }
        if (arg == "--dialect")
        {
            if (i + 1 >= args.Length)
                return new Parsed(false, false, dialects, null, "unknown arg: --dialect\n", 2);
            dialects.Add(args[++i]);
            continue;
        }
        if (arg.StartsWith("--dialect=", StringComparison.Ordinal))
        {
            dialects.Add(arg["--dialect=".Length..]);
            continue;
        }
        return new Parsed(false, false, dialects, null, $"unknown arg: {arg}\n", 2);
    }
    return new Parsed(false, all, dialects, language, null, 0);
}

static (IReadOnlyList<string> Names, string? Error, int ExitCode) ResolveDialects(Parsed parsed)
{
    var (providers, aliases) = LoadProviders();
    if (parsed.All)
        return (providers, null, 0);
    if (parsed.Dialects.Count == 0)
        return ([], "pass --dialect <provider> at least once, or --all\n", 2);

    var selected = new SortedSet<string>(StringComparer.Ordinal);
    foreach (var raw in parsed.Dialects)
    {
        var name = NormalizeProvider(raw, providers, aliases);
        if (name is null)
            return ([], $"unsupported provider: {raw}\n", 2);
        selected.Add(name);
    }
    return ([.. selected], null, 0);
}

static string NormalizeKey(string raw) =>
    string.Concat(raw.Where(c => c is not ' ' and not '_' and not '-')).ToLowerInvariant();

static string? NormalizeProvider(
    string raw,
    IReadOnlyList<string> providers,
    IReadOnlyDictionary<string, string> aliases
)
{
    var key = NormalizeKey(raw);
    var direct = providers.FirstOrDefault(p => NormalizeKey(p) == key);
    if (direct is not null)
        return direct;
    return aliases.TryGetValue(key, out var canonical) ? canonical : null;
}

static (List<string> Providers, Dictionary<string, string> Aliases) LoadProviders()
{
    var providers = new List<string>();
    var aliases = new Dictionary<string, string>(StringComparer.Ordinal);
    var path = Path.Combine(AppContext.BaseDirectory, "cli.yaml");
    var inProviders = false;
    var inAliases = false;
    foreach (var rawLine in File.ReadAllLines(path))
    {
        var line = rawLine.TrimEnd('\r');
        if (line.Length == 0 || line.StartsWith('#'))
            continue;
        if (line.Length > 0 && line[0] is not ' ' and not '-')
        {
            inProviders = false;
            inAliases = false;
        }
        if (line.StartsWith("providers:", StringComparison.Ordinal))
        {
            inProviders = true;
            continue;
        }
        if (line.StartsWith("provider_aliases:", StringComparison.Ordinal))
        {
            inAliases = true;
            continue;
        }
        if (inProviders)
        {
            var item = line.Trim();
            if (item.StartsWith("- ", StringComparison.Ordinal))
                providers.Add(item[2..].Trim());
            continue;
        }
        if (inAliases)
        {
            var trimmed = line.Trim();
            var colon = trimmed.IndexOf(':');
            if (colon > 0)
            {
                var alias = NormalizeKey(trimmed[..colon].Trim());
                var canonical = trimmed[(colon + 1)..].Trim();
                if (alias.Length > 0 && canonical.Length > 0)
                    aliases[alias] = canonical;
            }
        }
    }
    return (providers, aliases);
}

static string RenderProps(IReadOnlyList<string> enabled)
{
    var set = enabled.ToHashSet(StringComparer.Ordinal);
    var sb = new StringBuilder();
    sb.AppendLine("<Project>");
    sb.AppendLine("  <ItemGroup>");
    foreach (var (name, project) in new (string, string)[]
    {
        ("sqlite", "Dialects/Sqlite/MigrateSqlite.csproj"),
        ("postgres", "Dialects/Postgres/MigratePostgres.csproj"),
        ("mysql", "Dialects/Mysql/MigrateMysql.csproj"),
        ("sqlserver", "Dialects/SqlServer/MigrateSqlServer.csproj"),
        ("oracle", "Dialects/Oracle/MigrateOracle.csproj"),
    })
    {
        if (!set.Contains(name))
            continue;
        sb.AppendLine(
            $"    <ProjectReference Include=\"$(MSBuildThisFileDirectory){project}\" />"
        );
    }
    sb.AppendLine("  </ItemGroup>");
    sb.AppendLine("</Project>");
    return sb.ToString();
}

static string? FindCSharpRoot()
{
    foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
    {
        var dir = new DirectoryInfo(start);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "MigrateRunner.csproj")))
                return dir.FullName;
            dir = dir.Parent;
        }
    }
    return null;
}

static string HelpText()
{
    var (providers, _) = LoadProviders();
    var usage =
        $"Usage: migrate-init --language <typescript|csharp|rust> [--dialect <{string.Join('|', providers)}>] [--all]";
    var template = File.ReadAllText(
        Path.Combine(AppContext.BaseDirectory, "templates", "help", "init.txt")
    );
    return template.Replace("{{usage}}", usage, StringComparison.Ordinal)
        .Replace("{{command}}", "migrate-init", StringComparison.Ordinal);
}

sealed record Parsed(
    bool Help,
    bool All,
    List<string> Dialects,
    string? Language,
    string? Error,
    int ExitCode
);
