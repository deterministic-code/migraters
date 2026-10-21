---
name: migraters
description: >-
  Runs migrate-setup, migrate-up, migrate-down, and migrate-create for sqlite,
  postgres, mysql, sqlserver, and oracle. Use when the user mentions
  migraters, IMigrater, SQL migrations, or those commands. The IMigrater
  contract is in references/api.md. Library call samples are in
  references/authoring.md.
---

# Migraters

## Commands

| Ask | Run |
| --- | --- |
| Install | `npm install @deterministic-code/migraters`, then `npx migrate-init --dialect <dialect>…`. Call `npx migrate-setup`, `npx migrate-up`, `npx migrate-down`, and `npx migrate-create`. |
| Add a dialect | Re-run `npx migrate-init` with the dialects already enabled plus the new one. This only `npm install`s the TypeScript drivers (`better-sqlite3`, `pg`, `mysql2`, `mssql`, `oracledb`). It does not select `Microsoft.Data.Sqlite`, `Microsoft.Data.SqlClient`, or Rust features. |
| Setup | `npx migrate-setup --provider <dialect> [--connection <url>] [--and-up]` |
| Up | `npx migrate-up --provider <dialect> [--connection <url>]` |
| Down | `npx migrate-down --provider <dialect> [--connection <url>]` |
| Create | `npx migrate-create --provider <dialect> --name <snake_case>` |

Dialects: `sqlite`, `postgres`, `mysql`, `sqlserver`, `oracle`.

Setup, up, and down take `--connection` or the dialect env var (`SQLITE_PATH`, `PG_CONNECTION_STRING`, `MYSQL_URL`, `MSSQL_URL`, `ORACLE_CONNECT_STRING`, or `DATABASE_URL`). If provider or connection is missing, ask once before setup, up, or down. SQLite can be a file path such as `./app.sqlite` (`SQLITE_PATH`). SQL Server needs a driver connection string (`MSSQL_URL`).

Create takes `--name` (`^[a-z][a-z0-9_]*$`) and no connection. Run one `migrate-create` per provider. Default directory is `sql/<provider>/migrations`. After the TODO scaffold, write the SQL into both the up and down files. A second provider needs its own `migrate-create`.

`migrate-init` replaces the dialect set and takes no `--connection`. Down prints a confirm token; pass it back with `--confirm`.

If name is missing for create, ask once. Other flags are in `node_modules/@deterministic-code/migraters/cli.yaml` or `<command> --help`. Do not look for `cli.yaml` next to the skill.

## API Interface

`IMigrater` is `setup`, `up`, `down`, and `create` (C#: `Setup`, `Up`, `Down`, `Create`). `migrate-init` is not a method.

Read [references/api.md](references/api.md) for the contract. Read [references/authoring.md](references/authoring.md) only when the user asked for library code.
