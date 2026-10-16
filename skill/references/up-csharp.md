# up (C#)

Applies every pending migration in sequence, each in its own transaction.

`IMigrater` is `internal`. The supported entry from an application is the `migrate-up` CLI.

## CLI

```
migrate-up --provider <sqlite|postgres|mysql|sqlserver|oracle> --connection <url> [--migrations-path <dir>] [--migrations-root <dir>] [--one]
```

- `--provider` — database dialect. Required.
- `--connection` — connection string. Required, or set the per-dialect env var.
- `--migrations-path` (`--migrate-path`) — full path to the migrations directory (for example `sql/sqlite/migrations`).
- `--migrations-root` (`--migrate-root`) — root prefix; the script looks at `<migrations-root>/<dialect>/migrations`. Defaults to `sql`. Ignored when `--migrations-path` is also set.
- `--one` — apply only the next pending migration, then exit. Default is to apply all pending migrations.
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
migrate-up --provider sqlite --connection ./app.sqlite
migrate-up --provider sqlite --connection sqlite:///absolute/path/app.sqlite
migrate-up --provider postgres --connection postgresql://user:pass@host:5432/dbname
migrate-up --provider mysql --connection mysql://user:pass@host:3306/dbname
migrate-up --provider sqlserver --connection "Server=host;Database=dbname;User Id=user;Password=pass;"
migrate-up --provider oracle --connection "user/pass@host:1521/service"
SQLITE_PATH=./app.sqlite migrate-up --provider sqlite
DATABASE_URL=postgresql://... migrate-up --provider postgres
migrate-up --provider sqlite --connection ./app.sqlite --migrations-path ./db/changes/sqlite
migrate-up --provider sqlite --connection ./app.sqlite --migrations-root ./db/changes
migrate-up --provider sqlite --connection ./app.sqlite --one
```

## Contract

The in-tree command constructs `new Migrater(dialect)` and calls `Up`:

```csharp
IReadOnlyList<string> names = await migrater.Up(new UpArg(connection, migrationsPath, one: false));
```

`Task<IReadOnlyList<string>> Up(UpArg args)` where `UpArg` is `(string Connection, string MigrationsPath, bool One = false)`.

Returns the names applied in this run.
