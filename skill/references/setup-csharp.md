# setup (C#)

Creates the `migrates` and `migrate_logs` tables and the migrations directory. Idempotent. For sqlite, also creates the parent directory of `--connection`.

`IMigrater` is `internal`. The supported entry from an application is the `migrate-setup` CLI.

## CLI

```
migrate-setup --provider <sqlite|postgres|mysql|sqlserver|oracle> --connection <url> [--migrations-path <dir>] [--and-up]
```

- `--provider` — database dialect. Required.
- `--connection` — connection string. Required, or set the per-dialect env var.
- `--migrations-path` (`--migrate-path`) — migrations directory. Default: `./sql/<dialect>/migrations`.
- `--and-up` — after setup, invoke `migrate-up` so the chain is applied in one step.
- `-h` / `--help` — help on stderr.

`--migrations-root` is not a setup flag.

When `--connection` is omitted:

| Provider | Environment variables |
|---|---|
| sqlite | `SQLITE_PATH`, `DB_PATH` |
| postgres | `PG_CONNECTION_STRING`, `DATABASE_URL` |
| mysql | `MYSQL_URL`, `DATABASE_URL` |
| sqlserver | `MSSQL_URL`, `DATABASE_URL` |
| oracle | `ORACLE_CONNECT_STRING`, `DATABASE_URL` |

```
migrate-setup --provider sqlite --connection ./app.sqlite
migrate-setup --provider sqlite --connection sqlite:///absolute/path/app.sqlite
migrate-setup --provider postgres --connection postgresql://user:pass@host:5432/dbname
migrate-setup --provider mysql --connection mysql://user:pass@host:3306/dbname
migrate-setup --provider sqlserver --connection "Server=host;Database=dbname;User Id=user;Password=pass;"
migrate-setup --provider oracle --connection "user/pass@host:1521/service"
SQLITE_PATH=./app.sqlite migrate-setup --provider sqlite
DATABASE_URL=postgresql://... migrate-setup --provider postgres
DATABASE_URL=mysql://... migrate-setup --provider mysql
migrate-setup --provider sqlite --connection :memory:
```

## Contract

The in-tree command constructs `new Migrater(dialect)` and calls `Setup`:

```csharp
await migrater.Setup(new SetupArg(connection, migrationsPath));
```

`Task Setup(SetupArg args)` where `SetupArg` is `(string Connection, string MigrationsPath)`.
