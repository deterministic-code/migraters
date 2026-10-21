# Authoring

Call samples for `IMigrater`. The contract is in [api.md](api.md). Commands stay on the CLI. `migrate-init` is not a method.

## TypeScript

`getMigrater(provider)` from `@deterministic-code/migraters`.

```ts
const migrater = getMigrater('sqlite');
await migrater.setup({ connection, migrationsPath });
const names = await migrater.up({ connection, migrationsPath, one: false });
const rolledBack = await migrater.down({ connection, migrationsPath });
const { upName, downName } = await migrater.create({ name, migrationsPath });
```

`up` returns the names applied. `down` returns the rolled-back name, or `null`.

## Rust

```rust
let migrater = Migrater::new(try_get("sqlite")?);
migrater.setup(SetupArg { connection, migrations_path }).await?;
let names = migrater.up(UpArg { connection, migrations_path, one: false }).await?;
let rolled_back = migrater.down(DownArg { connection, migrations_path }).await?;
let created = migrater.create(CreateArg { name, migrations_path })?;
```

`up` returns the names applied. `down` returns the rolled-back name, or `None`. `create` returns `CreateResponse { up_name, down_name }`.

## C#

`IMigrater` is internal. The in-tree command constructs `new Migrater(dialect)`:

```csharp
await migrater.Setup(new SetupArg(connection, migrationsPath));
IReadOnlyList<string> names = await migrater.Up(new UpArg(connection, migrationsPath, one: false));
string? name = await migrater.Down(new DownArg(connection, migrationsPath));
CreateResponse created = await migrater.Create(new CreateArg(name, migrationsPath));
```

`Up` returns the names applied. `Down` returns the rolled-back name, or `null`. `CreateResponse` is `(UpName, DownName)`.
