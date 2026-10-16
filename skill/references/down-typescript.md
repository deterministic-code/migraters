# down (TypeScript)

Rolls back the most recently applied migration (one step). Destructive: prints a random 4-letter uppercase token on stderr and refuses to proceed unless the operator types it back on stdin, or passes `--confirm` with the same token. There is no fixed bypass value.

Package: `@deterministic-code/migraters`. The library `down` call does not print or check the token; the CLI does.

## CLI

```
migrate-down --provider <sqlite|postgres|mysql|sqlserver|oracle> --connection <url> [--migrations-path <dir>] [--migrations-root <dir>] [--confirm <TOKEN>]
```

- `--provider` — database dialect. Required.
- `--connection` — connection string. Required, or set the per-dialect env var.
- `--migrations-path` (`--migrate-path`) — full path to the migrations directory.
- `--migrations-root` (`--migrate-root`) — root prefix; the script looks at `<migrations-root>/<dialect>/migrations`. Defaults to `sql`. Ignored when `--migrations-path` is also set.
- `--confirm TOKEN` — skip the interactive prompt. The token must match the value printed on stderr at runtime.
- `-h` / `--help` — help on stderr.

When `--connection` is omitted:

| Provider | Environment variables |
|---|---|
| sqlite | `SQLITE_PATH`, `DB_PATH` |
| postgres | `PG_CONNECTION_STRING`, `DATABASE_URL` |
| mysql | `MYSQL_URL`, `DATABASE_URL` |
| sqlserver | `MSSQL_URL`, `DATABASE_URL` |
| oracle | `ORACLE_CONNECT_STRING`, `DATABASE_URL` |

```
migrate-down --provider sqlite --connection ./app.sqlite
migrate-down --provider sqlite --connection sqlite:///absolute/path/app.sqlite
migrate-down --provider postgres --connection postgresql://user:pass@host:5432/dbname
migrate-down --provider mysql --connection mysql://user:pass@host:3306/dbname
migrate-down --provider sqlserver --connection "Server=host;Database=dbname;User Id=user;Password=pass;"
migrate-down --provider oracle --connection "user/pass@host:1521/service"
SQLITE_PATH=./app.sqlite migrate-down --provider sqlite
DATABASE_URL=postgresql://... migrate-down --provider postgres
migrate-down --provider sqlite --connection ./app.sqlite --migrations-path ./db/changes/sqlite
```

## API

`getMigrater(provider)` returns `new Migrater(dialect)`.

```ts
import { getMigrater } from '@deterministic-code/migraters';

const migrater = getMigrater('sqlite');
const name = await migrater.down({
  connection: './app.sqlite',
  migrationsPath: './sql/sqlite/migrations',
});
```

`down(args: { connection: string; migrationsPath: string }): Promise<string | null>`

Returns the rolled-back name, or `null` when there is nothing to roll back.
