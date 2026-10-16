namespace Deterministic.MigrateRunner;

internal sealed record SetupArg(string Connection, string MigrationsPath);

internal sealed record UpArg(string Connection, string MigrationsPath, bool One = false);

internal sealed record DownArg(string Connection, string MigrationsPath);

internal sealed record CreateArg(string Name, string MigrationsPath);

internal sealed record CreateResponse(string UpName, string DownName);

internal interface IMigrater
{
    string Name { get; }
    Task Setup(SetupArg args);
    Task<IReadOnlyList<string>> Up(UpArg args);
    Task<string?> Down(DownArg args);
    Task<CreateResponse> Create(CreateArg args);
}
