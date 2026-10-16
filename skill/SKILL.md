---
name: migraters
description: >-
  Tracks SQL changes and applies them with migrate-init, ./build, migrate-setup,
  migrate-up, migrate-down, and migrate-create. Use whenever the user mentions
  migraters, IMigrater, SQL migrations, sqlite, postgres, mysql, sqlserver,
  oracle, TypeScript, Rust, or C# migrate commands, even if they do not name
  this skill.
---

# Migraters

Migraters tracks SQL changes and applies them through development. The same six commands and the same `IMigrater` contract exist in TypeScript, Rust, and C# for sqlite, postgres, mysql, sqlserver, and oracle.

Shared argv lives in `cli.yaml`. The library API (`setup`, `up`, `down`, `create`) lives in `api.yaml`. `migrate-init` and `./build` are CLI-only.

## Skill Prompts

When the user prompt matches a row below, **run those CLI commands**. Do not reconstruct install/init/build from memory. Open `references/*.md` only for missing flags (`--provider`, `--connection`, `--name`) or API samples. For create/up/down: if provider, name, or connection are missing, ask once or use the dialect env vars below — still call the CLI; do not invent library API usage unless the user asked for code.

| Prompt | Run |
| --- | --- |
| Install migraters and build for csharp for sqlite and postgres | `npm install @deterministic-code/migraters` (or `npm install` in-repo) → `migrate-init --dialect sqlite --dialect postgres` → `./build csharp` |
| Add driver \<dialect\> (e.g. oracle) | Read current enabled dialects (Cargo `default` features / last init stdout) → `migrate-init --dialect <existing…> --dialect <new>` → `./build <language>` |
| Create a new migrate | `migrate-create --provider … --name …` |
| migrate up | `migrate-up --provider … [--connection …]` |
| migrate down | `migrate-down --provider … [--connection …]` |

Concrete sequences:

```text
Install … csharp … sqlite and postgres
  → npm install @deterministic-code/migraters   # or npm install in-repo
  → migrate-init --dialect sqlite --dialect postgres
  → ./build csharp

Add driver <dialect>
  → read current enabled dialects
  → migrate-init --dialect <existing…> --dialect <new>
  → ./build <language>

Create a new migrate → migrate-create --provider … --name …
migrate up           → migrate-up --provider … [--connection …]
migrate down         → migrate-down --provider … [--connection …]
```

`migrate-init` replaces the dialect set. “Add driver” means re-init with prior dialects plus the new one, then build the same language as last time (or as the user stated).

## Commands

- **init** — select which dialects this tree compiles and installs. Not an `IMigrater` method. No `--connection`.
- **build** — compile one language after init. Uses the dialect set init already wrote.
- **setup** — create `migrates` and `migrate_logs` plus the migrations directory. Idempotent.
- **up** — apply every pending migration, each in its own transaction.
- **down** — roll back the most recently applied migration, one step, after a confirmation token.
- **create** — write the next `<NNNN>_<name>_up.sql` and `<NNNN>_<name>_down.sql` pair.

## Providers

`sqlite`, `postgres`, `mysql`, `sqlserver`, `oracle`. Aliases from `cli.yaml` apply (`pg`, `mssql`, `ora`, and the rest).

When `--connection` is omitted, the runner reads the first set environment variable:

| Provider | Environment variables |
|---|---|
| sqlite | `SQLITE_PATH`, `DB_PATH` |
| postgres | `PG_CONNECTION_STRING`, `DATABASE_URL` |
| mysql | `MYSQL_URL`, `DATABASE_URL` |
| sqlserver | `MSSQL_URL`, `DATABASE_URL` |
| oracle | `ORACLE_CONNECT_STRING`, `DATABASE_URL` |

Default migrations directory is `./sql/<dialect>/migrations`. `--migrations-root` looks under `<root>/<dialect>/migrations` and defaults to `sql`. It is ignored when `--migrations-path` is set.

## API

The four `IMigrater` verbs are one contract in every language. Catalog insert and delete stay inside `up` and `down`.

| Verb | TypeScript | Rust | C# |
|---|---|---|---|
| setup | `setup` | `setup` | `Setup` |
| up | `up` | `up` | `Up` |
| down | `down` | `down` | `Down` |
| create | `create` | `create` | `Create` |

## Progressive disclosure

Do not paste API samples from memory. Pick the verb and the language, then read exactly one file:

`references/<verb>-<language>.md`

Language is `typescript`, `rust`, or `csharp`. Example: a TypeScript setup reads [references/setup-typescript.md](references/setup-typescript.md) and leaves the Rust and C# files unread.

`init` and `build` have no `IMigrater` method:

- init → [references/init.md](references/init.md)
- build → [references/build.md](references/build.md)

| Verb | TypeScript | Rust | C# |
|---|---|---|---|
| setup | [setup-typescript.md](references/setup-typescript.md) | [setup-rust.md](references/setup-rust.md) | [setup-csharp.md](references/setup-csharp.md) |
| up | [up-typescript.md](references/up-typescript.md) | [up-rust.md](references/up-rust.md) | [up-csharp.md](references/up-csharp.md) |
| down | [down-typescript.md](references/down-typescript.md) | [down-rust.md](references/down-rust.md) | [down-csharp.md](references/down-csharp.md) |
| create | [create-typescript.md](references/create-typescript.md) | [create-rust.md](references/create-rust.md) | [create-csharp.md](references/create-csharp.md) |
