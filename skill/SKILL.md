---
name: migraters
description: >-
  Runs migrate-init, ./build, migrate-setup, migrate-up, migrate-down, and
  migrate-create for sqlite, postgres, mysql, sqlserver, and oracle. Use when
  the user mentions migraters, IMigrater, SQL migrations, or those commands.
  The IMigrater contract is in references/api.md. Library call samples are in
  references/authoring.md.
---

# Migraters

## Commands

| Ask | Run |
| --- | --- |
| Install and build | `npm install @deterministic-code/migraters` (in-repo: `npm install`) → `migrate-init --dialect <dialect>…` → `./build <typescript\|rust\|csharp>` |
| Add a dialect | `migrate-init` with the dialects already enabled plus the new one, then `./build` the same language |
| Setup | `migrate-setup --provider <dialect> [--connection <url>] [--and-up]` |
| Up | `migrate-up --provider <dialect> [--connection <url>]` |
| Down | `migrate-down --provider <dialect> [--connection <url>]` |
| Create | `migrate-create --provider <dialect> --name <snake_case>` |

Dialects: `sqlite`, `postgres`, `mysql`, `sqlserver`, `oracle`.

`migrate-init` replaces the dialect set and takes no `--connection`. `./build` compiles one language from that set. Setup, up, and down take `--connection` or the dialect env var (`SQLITE_PATH`, `PG_CONNECTION_STRING`, `MYSQL_URL`, `MSSQL_URL`, `ORACLE_CONNECT_STRING`, or `DATABASE_URL`). Create takes `--name` (`^[a-z][a-z0-9_]*$`) and no connection. Down prints a confirm token; pass it back with `--confirm`.

If provider, connection, or name is missing, ask once. Other flags are in `cli.yaml` or `<command> --help`.

## API Interface

`IMigrater` is `setup`, `up`, `down`, and `create` (C#: `Setup`, `Up`, `Down`, `Create`). `migrate-init` and `./build` are not methods.

Read [references/api.md](references/api.md) for the contract. Read [references/authoring.md](references/authoring.md) only when the user asked for library code.
