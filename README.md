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

The four verbs are one contract in every language: argv in [`cli.yaml`](cli.yaml), dialect operations in [`api.yaml`](api.yaml). TypeScript publishes library functions (`setupSql`, `runUp`, `runDown`, `nextSequence`). Rust and C# run the same operations on the dialect and pool the commands already use.

Tabbed TypeScript / Rust / C# / CLI interfaces live in the Cursor canvas [Command API](/Users/ryan/.cursor/projects/Users-ryan-Projects-migraters/canvases/migrate-command-api.canvas.tsx) (open beside chat). Each card names the source of the call:

| Verb | TypeScript | Rust | C# | CLI |
|---|---|---|---|---|
| setup | [`sql-dialect.ts`](typescript/src/abstractions/sql-dialect.ts) `prepareSetup`, [`setup-sql.ts`](typescript/src/setup-sql.ts) | [`SqlDialect`](rust/src/abstractions/sql_dialect.rs) | [`ISqlDialect`](csharp/Abstractions/ISqlDialect.cs) | [`cli.yaml`](cli.yaml) `setup` |
| up | [`runUp`](typescript/src/datasource-migrate.ts) | [`MigrationPool::apply_statements`](rust/src/infrastructure/pool.rs) + `insert_applied_sql` | [`DbExecute.ApplyStatementsAsync`](csharp/Infrastructure/DbExecute.cs) + `InsertAppliedSql` | [`cli.yaml`](cli.yaml) `up` |
| down | [`runDown`](typescript/src/datasource-migrate.ts) | `apply_statements` + `delete_applied_sql` | `ApplyStatementsAsync` + `DeleteAppliedSql` | [`cli.yaml`](cli.yaml) `down` |
| create | [`create-sequence.ts`](typescript/src/create-sequence.ts) | [`migrations.rs`](rust/src/migrations.rs) | [`Migrations`](csharp/Infrastructure/Migrations.cs) | [`cli.yaml`](cli.yaml) `create` |

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

Shared argv, flags, aliases, exit codes, and command behavior live in [`cli.yaml`](cli.yaml). Dialect operations every language implements live in [`api.yaml`](api.yaml). SQL spelling stays a provider detail.
