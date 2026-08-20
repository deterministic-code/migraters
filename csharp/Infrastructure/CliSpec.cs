namespace Deterministic.MigrateRunner;

internal static class CliSpec
{
    private readonly record struct Arg(string Flag, string? Placeholder, bool Required);

    private readonly record struct Command(string Verb, Arg[] Args);

    private sealed record Spec(string Command, string[] Providers, Command[] Commands);

    private static readonly Spec Document = Parse(File.ReadAllText(SpecPath()));

    internal static string UsageLine(string verb)
    {
        var providers = string.Join('|', Document.Providers);
        var command = Document.Command.Replace("{verb}", verb, StringComparison.Ordinal);
        var entry = Document.Commands.First(c => c.Verb == verb);
        var args = string.Join(' ', entry.Args.Select(a => ArgUsage(a, providers)));
        return $"Usage: {command} {args}";
    }

    internal static string ProgramUsage() =>
        string.Join('\n', Document.Commands.Select(c => UsageLine(c.Verb))) + "\n";

    private static string ArgUsage(Arg arg, string providers)
    {
        var body = arg.Placeholder is null
            ? arg.Flag
            : $"{arg.Flag} <{(arg.Placeholder == "providers" ? providers : arg.Placeholder)}>";
        return arg.Required ? body : $"[{body}]";
    }

    private static string SpecPath()
    {
        var nextToApp = Path.Combine(AppContext.BaseDirectory, "cli.yaml");
        if (File.Exists(nextToApp))
            return nextToApp;
        return Path.Combine(AppContext.BaseDirectory, "templates", "cli.yaml");
    }

    private static Spec Parse(string raw)
    {
        var command = "migrate-{verb}";
        var providers = new List<string>();
        var commands = new List<Command>();
        var inProviders = false;
        var inCommands = false;
        string? currentVerb = null;
        var currentArgs = new List<Arg>();
        var inArgs = false;

        void Flush()
        {
            if (currentVerb is null)
                return;
            commands.Add(new Command(currentVerb, [.. currentArgs]));
            currentVerb = null;
            currentArgs.Clear();
            inArgs = false;
        }

        foreach (var rawLine in raw.Split('\n'))
        {
            var line = rawLine.TrimEnd('\r');
            if (line.Length == 0 || line.StartsWith('#'))
                continue;
            if (line.Length > 0 && line[0] is not ' ' and not '-')
            {
                inProviders = false;
                if (!line.StartsWith("commands:", StringComparison.Ordinal))
                {
                    inCommands = false;
                    Flush();
                }
            }
            if (line.StartsWith("command:", StringComparison.Ordinal))
            {
                command = line.Split(':', 2)[1].Trim();
                continue;
            }
            if (line.StartsWith("providers:", StringComparison.Ordinal))
            {
                inProviders = true;
                continue;
            }
            if (line.StartsWith("commands:", StringComparison.Ordinal))
            {
                inCommands = true;
                continue;
            }
            if (inProviders)
            {
                var item = line.Trim();
                if (item.StartsWith("- ", StringComparison.Ordinal))
                    providers.Add(item[2..].Trim());
                continue;
            }
            if (!inCommands)
                continue;
            var trimmed = line.Trim();
            if (trimmed.StartsWith("- verb:", StringComparison.Ordinal))
            {
                Flush();
                currentVerb = trimmed["- verb:".Length..].Trim();
                continue;
            }
            if (trimmed == "args:")
            {
                inArgs = true;
                continue;
            }
            if (inArgs && trimmed.StartsWith("- {", StringComparison.Ordinal))
                currentArgs.Add(ParseArg(trimmed));
        }
        Flush();
        return new Spec(command, [.. providers], [.. commands]);
    }

    private static Arg ParseArg(string line)
    {
        var start = line.IndexOf('{');
        var end = line.LastIndexOf('}');
        var flag = "";
        string? placeholder = null;
        var required = false;
        foreach (var part in line[(start + 1)..end].Split(','))
        {
            var kv = part.Split(':', 2);
            if (kv.Length != 2)
                continue;
            var key = kv[0].Trim();
            var value = kv[1].Trim();
            switch (key)
            {
                case "flag":
                    flag = value;
                    break;
                case "placeholder":
                    placeholder = value;
                    break;
                case "required":
                    required = value == "true";
                    break;
            }
        }
        return new Arg(flag, placeholder, required);
    }
}
