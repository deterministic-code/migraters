# Migraters

Migraters lets you track SQL changes and apply them to your project throughout the development cycle. This project provides database migrate commands and a consistent API in multiple programming languages and many datasource dialects.

## Commands

### setup

Creates the `migrates` and `migrate_logs` tables and the migrations directory. Idempotent.

```
migrate-setup --provider <sqlite|postgres|mysql|sqlserver|oracle> --connection <url> [--migrations-path <dir>] [--and-up]
```

`--and-up` runs `migrate-up` immediately after setup. Default migrations directory is `./sql/<dialect>/migrations`.

### up

Applies every pending migration, each in its own transaction.

```
migrate-up --provider <…> --connection <url> [--migrations-path <dir>] [--migrations-root <dir>] [--one]
```

`--migrations-root` looks under `<root>/<dialect>/migrations` and defaults to `sql`. It is ignored when `--migrations-path` is set. `--one` applies only the next pending migration.

### down

Rolls back the most recently applied migration, one step. Prints a random 4-letter token and refuses to continue unless you type that token, or pass `--confirm` with the same token.

```
migrate-down --provider <…> --connection <url> [--migrations-path <dir>] [--migrations-root <dir>] [--confirm <TOKEN>]
```

### create

Writes the next `<NNNN>_<name>_up.sql` and `<NNNN>_<name>_down.sql` pair. The name must match `^[a-z][a-z0-9_]*$`.

```
migrate-create --provider <…> --name <snake_case_slug> [--migrations-path <dir>]
```

## API

The four verbs are one contract in every language: argv in [`cli.yaml`](cli.yaml), `IMigrater` in [`api.yaml`](api.yaml). Each language implements that interface. Catalog insert and delete stay inside `up` and `down`.

| Verb | TypeScript [`IMigrater`](typescript/src/abstractions/migrater.ts) | Rust [`IMigrater`](rust/src/migrater.rs) | C# [`IMigrater`](csharp/Abstractions/IMigrater.cs) |
|---|---|---|---|
| setup | `setup` | `setup` | `Setup` |
| up | `up` | `up` | `Up` |
| down | `down` | `down` | `Down` |
| create | `create` | `create` | `Create` |

## Language support

| Datasource | C# | Rust | TypeScript |
|---|---|---|---|
| sqlite | yes | yes | yes |
| postgres | yes | yes | yes |
| mysql | yes | yes | yes |
| sqlserver | yes | yes | yes |
| oracle | yes | yes | yes |

## Providers

`sqlite`, `postgres`, `mysql`, `sqlserver`, and `oracle`.

When `--connection` is omitted, the runner reads the first set environment variable for that dialect:

| Provider | Environment variables |
|---|---|
| sqlite | `SQLITE_PATH`, `DB_PATH` |
| postgres | `PG_CONNECTION_STRING`, `DATABASE_URL` |
| mysql | `MYSQL_URL`, `DATABASE_URL` |
| sqlserver | `MSSQL_URL`, `DATABASE_URL` |
| oracle | `ORACLE_CONNECT_STRING`, `DATABASE_URL` |

## Specification

Shared argv, flags, aliases, exit codes, and command behavior live in [`cli.yaml`](cli.yaml). `IMigrater` (`setup`, `up`, `down`, `create`) lives in [`api.yaml`](api.yaml). SQL spelling stays a provider detail.
