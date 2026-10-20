# API Interface

`api.yaml` lists `IMigrater` as `setup`, `up`, `down`, and `create`. Catalog insert and delete stay inside `up` and `down`. `migrate-init` and `./build` are not methods.

Sources: `typescript/src/abstractions/migrater.ts`, `rust/src/migrater.rs`, `csharp/Abstractions/IMigrater.cs`.

## TypeScript

```ts
export type SetupArg = { connection: string; migrationsPath: string };
export type UpArg = { connection: string; migrationsPath: string; one?: boolean };
export type DownArg = { connection: string; migrationsPath: string };
export type CreateArg = { name: string; migrationsPath: string };
export type CreateResponse = { upName: string; downName: string };

export interface IMigrater {
  readonly name: string;
  setup(args: SetupArg): Promise<void>;
  up(args: UpArg): Promise<string[]>;
  down(args: DownArg): Promise<string | null>;
  create(args: CreateArg): Promise<CreateResponse>;
}
```

`up` returns the names applied. `down` returns the rolled-back name, or `null`.

## Rust

```rust
pub struct SetupArg<'a> {
    pub connection: &'a str,
    pub migrations_path: &'a str,
}

pub struct UpArg<'a> {
    pub connection: &'a str,
    pub migrations_path: &'a str,
    pub one: bool,
}

pub struct DownArg<'a> {
    pub connection: &'a str,
    pub migrations_path: &'a str,
}

pub struct CreateArg<'a> {
    pub name: &'a str,
    pub migrations_path: &'a str,
}

pub struct CreateResponse {
    pub up_name: String,
    pub down_name: String,
}

pub trait IMigrater: Send + Sync {
    fn name(&self) -> &'static str;
    async fn setup(&self, args: SetupArg<'_>) -> Result<(), BoxError>;
    async fn up(&self, args: UpArg<'_>) -> Result<Vec<String>, BoxError>;
    async fn down(&self, args: DownArg<'_>) -> Result<Option<String>, BoxError>;
    fn create(&self, args: CreateArg<'_>) -> Result<CreateResponse, BoxError>;
}
```

`up` returns the names applied. `down` returns the rolled-back name, or `None`.

## C#

`IMigrater` is internal.

```csharp
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
```

`Up` returns the names applied. `Down` returns the rolled-back name, or `null`.
