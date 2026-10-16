# create (Rust)

Creates a new `<NNNN>_<name>_up.sql` and `<NNNN>_<name>_down.sql` pair scaffolded with TODO placeholders. `NNNN` is one greater than the highest 1–4-digit sequence prefix already present in the migrations directory (starts at `0001`). Legacy timestamp-prefixed filenames are ignored for numbering.

The name must match `^[a-z][a-z0-9_]*$`.

Crate: `deterministic-migraters`. `create` is synchronous.

## CLI

```
migrate-create --provider <sqlite|postgres|mysql|sqlserver|oracle> --name <snake_case_slug> [--migrations-path <dir>]
```

- `--provider` — database dialect. Required.
- `--name` — snake_case slug. Required. Must match `/^[a-z][a-z0-9_]*$/`.
- `--migrations-path` (`--migrate-path`) — migrations directory. Default: `./sql/<dialect>/migrations`. Created with mkdir -p if it does not exist.
- `-h` / `--help` — help on stderr.

Create does not take `--connection`.

```
migrate-create --provider sqlite --name add_users
migrate-create --provider postgres --name backfill_email_lower --migrations-path ./db/changes/postgres
```

## API

```rust
use deterministic_migraters::{try_get, IMigrater, CreateArg, Migrater};

let dialect = try_get("sqlite").expect("sqlite dialect");
let migrater = Migrater::new(dialect);
let created = migrater.create(CreateArg {
    name: "add_users",
    migrations_path: "./sql/sqlite/migrations",
})?;
```

`fn create(&self, args: CreateArg<'_>) -> Result<CreateResponse, Box<dyn std::error::Error>>`

`CreateResponse` has `up_name` and `down_name`.
