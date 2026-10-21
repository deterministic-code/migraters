# Migraters

[![CI](https://github.com/deterministic-code/migraters/actions/workflows/proof.yml/badge.svg)](https://github.com/deterministic-code/migraters/actions/workflows/proof.yml)

Migraters allows you to save SQL changes during development so they can be applied upstream later. As a codebase grows in complexity and team size, keeping those changes tracked and in sync becomes harder. Migraters is built for that.

The typical workflow is:

* On development, create one or more migration files, test them, and run migrate up.
* On deploy, those scripts are copied to production and migrate up is run again, so the upstream database matches development.

The migrate commands are available in [many languages](#language-support) and support [many SQL dialects](#providers).

## Install skill

Agent skill for Claude or Cursor: [skill/SKILL.md](skill/SKILL.md).

```shell
npx skills add https://github.com/deterministic-code/migraters/tree/main/skill -g -a cursor -a claude-code -y --copy
```

## Install

### Install from npm

```shell
npm install @deterministic-code/migraters
```

## Skill Prompts

Natural-language prompts the [skill](skill/SKILL.md) maps straight to CLI commands:

| Prompt | Runs |
| --- | --- |
| Install migraters for sqlite and postgres | `npm install` → `npx migrate-init --language typescript --dialect sqlite --dialect postgres` |
| Add driver oracle | `npx migrate-init --language <language>` with prior dialects **plus** `oracle` |
| Create a new migrate | `npx migrate-create` |
| migrate up | `npx migrate-up` |
| migrate down | `npx migrate-down` |

## Quick example

`user.sql`:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
```

```shell
npx migrate-init --language typescript --dialect sqlite
npx migrate-setup --provider sqlite --connection ./app.sqlite
npx migrate-create --provider sqlite --name add_users
touch user.sql
cat user.sql > sql/sqlite/migrations/0001_add_users_up.sql
npx migrate-up --provider sqlite --connection ./app.sqlite
```

## Commands

### init

The `migrate-init` command installs language and datasource dependencies and builds the migrate commands.

```shell
npx migrate-init --language typescript --dialect sqlite --dialect postgres
npx migrate-init --language csharp --dialect sqlite
npx migrate-init --language rust --dialect sqlite
```

### setup

Creates the `migrates` and `migrate_logs` tables and the migrations directory. Idempotent.

```shell
npx migrate-setup --provider <sqlite|postgres|mysql|sqlserver|oracle> --connection <url> [--migrations-path <dir>] [--and-up] [--create-database]
```

`--create-database` creates the database named in `--connection` if it does not exist. `--and-up` runs `migrate-up` immediately after setup. Default migrations directory is `./sql/<dialect>/migrations`.

### up

Applies every pending migration, each in its own transaction.

```shell
npx migrate-up --provider <…> --connection <url> [--migrations-path <dir>] [--migrations-root <dir>] [--one]
```

`--migrations-root` looks under `<root>/<dialect>/migrations` and defaults to `sql`. It is ignored when `--migrations-path` is set. `--one` applies only the next pending migration. A whole-line `GO` (sqlcmd-style) splits a file into batches; each batch is executed separately.

### down

Rolls back the most recently applied migration, one step. Type `confirm` at the prompt, or pass `--confirm`.

```shell
npx migrate-down --provider <…> --connection <url> [--migrations-path <dir>] [--migrations-root <dir>] [--confirm]
```

### create

Writes the next `<NNNN>_<name>_up.sql` and `<NNNN>_<name>_down.sql` pair. The name must match `^[a-z][a-z0-9_]*$`.

```shell
npx migrate-create --provider <…> --name <snake_case_slug> [--migrations-path <dir>]
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
