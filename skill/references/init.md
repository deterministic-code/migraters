# migrate-init

Selects the dialects this tree will compile and install. `migrate-init` is project setup, not an `IMigrater` method, and it does not take `--connection`.

Repeat `--dialect` once per provider. Aliases from `cli.yaml` apply (`pg`, `mssql`, `ora`, and the rest). Re-running replaces the previous set. `--all` restores every dialect.

Committed manifests keep every dialect, so a clone that never runs init still builds and tests with all providers. Init is what makes a local or vendored tree light: Rust compiles only the selected Cargo features, C# restores only the selected driver packages, and TypeScript installs only the selected native drivers. Run init before `cargo build`, `dotnet build`, or `npm install` when you want a slim tree.

## Flags

- `--dialect` — dialect to enable. Repeat for each dialect.
- `--all` — enable every dialect. Restores the committed full-provider set.
- `-h` / `--help` — help on stderr.

## Examples

```
migrate-init --dialect sqlite --dialect postgres
migrate-init --dialect oracle
migrate-init --all
```
