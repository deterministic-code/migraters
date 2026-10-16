# Migraters

Migraters lets you track SQL changes and apply them to your project throughout the development cycle. This project provides database migrate commands and a consistent API in multiple programming languages and many datasource dialects.

## Install

### Install from npm

```shell
npm install @deterministic-code/migraters
```

### Install skill

Agent skill for Claude or Cursor: [skill/SKILL.md](skill/SKILL.md).

```shell
npx skills add https://github.com/deterministic-code/migraters/tree/main/skill -g -a cursor -a claude-code -y --copy
```

## Commands

### init

Selects the dialects this tree will compile and install. `migrate-init` is project setup, not an `IMigrater` method, and it does not take `--connection`. Repeat `--dialect` once per provider (aliases from [`cli.yaml`](cli.yaml) apply: `pg`, `mssql`, `ora`, and the rest). Re-running replaces the previous set. `--all` restores every dialect.

```shell
migrate-init --dialect sqlite --dialect postgres
migrate-init --dialect oracle
migrate-init --all
```

Committed manifests keep every dialect, so a clone that never runs init still builds and tests with all providers. Init is what makes a local or vendored tree light: Rust compiles only the selected Cargo features, C# restores only the selected driver packages, and TypeScript installs only the selected native drivers. Run init before `cargo build`, `dotnet build`, or `npm install` when you want a slim tree.

### build

Compiles one language after init. Uses the dialect set init already wrote.

```shell
./build rust
./build csharp
./build typescript
```

### setup

Creates the `migrates` and `migrate_logs` tables and the migrations directory. Idempotent.

```shell
migrate-setup --provider <sqlite|postgres|mysql|sqlserver|oracle> --connection <url> [--migrations-path <dir>] [--and-up]
```

`--and-up` runs `migrate-up` immediately after setup. Default migrations directory is `./sql/<dialect>/migrations`.

### up

Applies every pending migration, each in its own transaction.

```shell
migrate-up --provider <…> --connection <url> [--migrations-path <dir>] [--migrations-root <dir>] [--one]
```

`--migrations-root` looks under `<root>/<dialect>/migrations` and defaults to `sql`. It is ignored when `--migrations-path` is set. `--one` applies only the next pending migration.

### down

Rolls back the most recently applied migration, one step. Prints a random 4-letter token and refuses to continue unless you type that token, or pass `--confirm` with the same token.

```shell
migrate-down --provider <…> --connection <url> [--migrations-path <dir>] [--migrations-root <dir>] [--confirm <TOKEN>]
```

### create

Writes the next `<NNNN>_<name>_up.sql` and `<NNNN>_<name>_down.sql` pair. The name must match `^[a-z][a-z0-9_]*$`.

```shell
migrate-create --provider <…> --name <snake_case_slug> [--migrations-path <dir>]
```

## API

The four `IMigrater` verbs are one contract in every language: argv in [`cli.yaml`](cli.yaml), `IMigrater` in [`api.yaml`](api.yaml). Each language implements that interface. Catalog insert and delete stay inside `up` and `down`. `migrate-init` lives only in [`cli.yaml`](cli.yaml).

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

Shared argv, flags, aliases, exit codes, and command behavior live in [`cli.yaml`](cli.yaml). `IMigrater` (`setup`, `up`, `down`, `create`) lives in [`api.yaml`](api.yaml). `migrate-init` is CLI-only. SQL spelling stays a provider detail.
