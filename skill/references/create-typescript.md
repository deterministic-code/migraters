# create (TypeScript)

Creates a new `<NNNN>_<name>_up.sql` and `<NNNN>_<name>_down.sql` pair scaffolded with TODO placeholders. `NNNN` is one greater than the highest 1–4-digit sequence prefix already present in the migrations directory (starts at `0001`). Legacy timestamp-prefixed filenames are ignored for numbering.

The name must match `^[a-z][a-z0-9_]*$`.

Package: `@deterministic-code/migraters`.

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

`getMigrater(provider)` returns `new Migrater(dialect)`.

```ts
import { getMigrater } from '@deterministic-code/migraters';

const migrater = getMigrater('sqlite');
const { upName, downName } = await migrater.create({
  name: 'add_users',
  migrationsPath: './sql/sqlite/migrations',
});
```

`create(args: { name: string; migrationsPath: string }): Promise<{ upName: string; downName: string }>`
