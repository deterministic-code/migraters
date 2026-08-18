import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { defaultDialectFactory } from "./dialects/default-factory.ts";
import type { ISqlDialect } from "./dialects/sql-dialect.ts";
import type {
  MigrationClient,
  MigrationRowValue,
} from "./migration-client.ts";
import { pathExists, type SqlDialect } from "./sql.ts";

export { normalizeDialect } from "./sql.ts";
export type {
  MigrationClient,
  MigrationRow,
  MigrationSqlParam,
  SqliteRawDatabase,
} from "./migration-client.ts";
export { applyMysqlDdlViaTextProtocol } from "./dialects/mysql-dialect.ts";

/** One discovered migration: its up script and the rollback sibling when present. */
export interface MigrationDescriptor {
  name: string;
  upPath: string;
  downPath: string | null;
}

const ROLLBACK_PREFIX = "rollback_";
const UP_SUFFIX = "_up.sql";
const DOWN_SUFFIX = "_down.sql";

export async function discoverMigrations({
  migratePath,
  dialect,
}: {
  migratePath: string;
  dialect: string;
}): Promise<MigrationDescriptor[]> {
  const key = requireDialect(dialect);
  if (!migratePath || !(await pathExists(migratePath))) return [];

  const allFiles = await listSqlFilesRecursive(migratePath);
  const { ups, downsByUpPath } = classifyMigrationFiles(allFiles, key);

  ups.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return ups.map(({ file, name }) => ({
    name,
    upPath: file,
    downPath: downsByUpPath.get(file) ?? null,
  }));
}

interface ClassifiedMigrationFiles {
  ups: { file: string; name: string }[];
  downsByUpPath: Map<string, string>;
}

type FileClassification =
  | { role: "up"; name: string }
  | { role: "down"; upPath: string }
  | null;

function classifyMigrationFile(
  file: string,
  key: SqlDialect,
): FileClassification {
  const base = basename(file);
  if (base.endsWith(DOWN_SUFFIX)) {
    const stem = base.slice(0, -DOWN_SUFFIX.length);
    return {
      role: "down",
      upPath: file.slice(0, -base.length) + `${stem}${UP_SUFFIX}`,
    };
  }
  if (base.endsWith(UP_SUFFIX)) {
    return { role: "up", name: base.slice(0, -UP_SUFFIX.length) };
  }
  if (base.startsWith(ROLLBACK_PREFIX)) {
    return {
      role: "down",
      upPath: file.slice(0, -base.length) + base.slice(ROLLBACK_PREFIX.length),
    };
  }
  if (base === `migration.${key}.sql`) {
    return { role: "up", name: basename(dirname(file)) };
  }
  if (base.endsWith(`.${key}.sql`)) return { role: "up", name: base };
  return null;
}

function classifyMigrationFiles(
  allFiles: string[],
  key: SqlDialect,
): ClassifiedMigrationFiles {
  const ups: { file: string; name: string }[] = [];
  const downsByUpPath = new Map<string, string>();
  for (const file of allFiles) {
    const c = classifyMigrationFile(file, key);
    if (c === null) continue;
    if (c.role === "up") ups.push({ file, name: c.name });
    else downsByUpPath.set(c.upPath, file);
  }
  return { ups, downsByUpPath };
}

async function listSqlFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith(".sql")) {
        out.push(full);
      }
    }
  }
  return out;
}

export { setupSql } from "./setup-sql.ts";

/** Strip pre-refactor `-- deterministic-content-hash: <sha>` header if present so upgrading users carrying the legacy header keep the same checksum migrate:up recorded. */
const LEGACY_HEADER_RE =
  /^(?:\/\/|--|#)\s+deterministic-content-hash:\s+[0-9a-f]{64}\s*\r?\n?/;

export function checksum(text: string): string {
  const body = text.replace(LEGACY_HEADER_RE, "");
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export async function readSqlStatements(filePath: string): Promise<string[]> {
  const text = await readFile(filePath, "utf8");
  return parseSqlStatements(text);
}

const isSqlWordBoundary = (ch: string | undefined): boolean =>
  ch === undefined || !/[A-Za-z0-9_]/.test(ch);

function matchDollarTag(text: string, startIdx: number): string | null {
  if (text[startIdx] !== "$") return null;
  if (text[startIdx + 1] === "$") return "";
  const m = /^\$([A-Za-z_][A-Za-z0-9_]*)\$/.exec(text.slice(startIdx));
  return m ? m[1] : null;
}

/** End index of a whole-line `GO` batch separator at line-start position `i`, or -1 when that line is not a bare `GO`. */
function wholeLineGoEnd(text: string, i: number): number {
  const eol = text.indexOf("\n", i);
  const lineEnd = eol === -1 ? text.length : eol;
  return /^\s*GO\s*$/i.test(text.slice(i, lineEnd)) ? lineEnd : -1;
}

interface SqlScanState {
  stmts: string[];
  buf: string;
  inSingle: boolean;
  inLineComment: boolean;
  inBlockComment: boolean;
  beginDepth: number;
  dollarTag: string | null;
}

function consumeDollarBody(text: string, i: number, st: SqlScanState): number {
  const closer = `$${st.dollarTag}$`;
  if (text.slice(i, i + closer.length) === closer) {
    st.buf += closer;
    st.dollarTag = null;
    return i + closer.length - 1;
  }
  st.buf += text[i];
  return i;
}

function consumeBlockComment(
  text: string,
  i: number,
  st: SqlScanState,
): number {
  st.buf += text[i];
  if (text[i] === "*" && text[i + 1] === "/") {
    st.buf += text[i + 1];
    st.inBlockComment = false;
    return i + 1;
  }
  return i;
}

function consumeSingleQuote(text: string, i: number, st: SqlScanState): number {
  const c = text[i];
  st.buf += c;
  if (c === "'") {
    if (text[i + 1] === "'") {
      st.buf += text[i + 1];
      return i + 1;
    }
    st.inSingle = false;
  }
  return i;
}

/** Consume one char while inside an open dollar-quote / comment / single-quote region, appending to `st.buf`. Returns the new index, or -1 when no region is open. */
function consumeOpenSqlRegion(
  text: string,
  i: number,
  st: SqlScanState,
): number {
  if (st.dollarTag !== null) return consumeDollarBody(text, i, st);
  if (st.inLineComment) {
    st.buf += text[i];
    if (text[i] === "\n") st.inLineComment = false;
    return i;
  }
  if (st.inBlockComment) return consumeBlockComment(text, i, st);
  if (st.inSingle) return consumeSingleQuote(text, i, st);
  return -1;
}

function openDollarQuote(text: string, i: number, st: SqlScanState): number {
  const tag = matchDollarTag(text, i);
  if (tag === null) return -1;
  const opener = `$${tag}$`;
  st.buf += opener;
  st.dollarTag = tag;
  return i + opener.length - 1;
}

/** Open a dollar-quote / line-comment / block-comment / single-quote region starting at `i`. Returns the new index, or -1 when nothing opens here. */
function openSqlRegion(text: string, i: number, st: SqlScanState): number {
  const c = text[i];
  const next = text[i + 1];
  if (c === "-" && next === "-") {
    st.buf += c;
    st.inLineComment = true;
    return i;
  }
  if (c === "/" && next === "*") {
    st.buf += c;
    st.inBlockComment = true;
    return i;
  }
  if (c === "'") {
    st.inSingle = true;
    st.buf += c;
    return i;
  }
  if (c === "$") return openDollarQuote(text, i, st);
  return -1;
}

/** Track `BEGIN…END` nesting so a `;` inside a routine body doesn't end the statement. Returns the new index, or -1 when `i` is not at a BEGIN/END keyword. */
function consumeBeginEnd(text: string, i: number, st: SqlScanState): number {
  const c = text[i];
  if ((c === "B" || c === "b") && isSqlWordBoundary(text[i - 1])) {
    if (
      /^begin/i.test(text.slice(i, i + 5)) &&
      isSqlWordBoundary(text[i + 5])
    ) {
      st.beginDepth++;
      st.buf += text.slice(i, i + 5);
      return i + 4;
    }
  }
  if ((c === "E" || c === "e") && isSqlWordBoundary(text[i - 1])) {
    if (
      /^end/i.test(text.slice(i, i + 3)) &&
      isSqlWordBoundary(text[i + 3]) &&
      st.beginDepth > 0
    ) {
      st.beginDepth--;
      st.buf += text.slice(i, i + 3);
      return i + 2;
    }
  }
  return -1;
}

function flushStatement(st: SqlScanState): void {
  const s = st.buf.trim();
  if (s.length > 0) st.stmts.push(s);
  st.buf = "";
}

/** Advance the scan by one char: consume an open region, honor a whole-line `GO`, open a region, track `BEGIN…END`, split on a top-level `;`, else buffer the char. Returns the index to resume from (the loop's `i++` moves past it). */
function scanSqlChar(text: string, i: number, st: SqlScanState): number {
  const consumed = consumeOpenSqlRegion(text, i, st);
  if (consumed !== -1) return consumed;
  if (i === 0 || text[i - 1] === "\n") {
    const goEnd = wholeLineGoEnd(text, i);
    if (goEnd !== -1) {
      flushStatement(st);
      st.beginDepth = 0;
      return goEnd;
    }
  }
  const opened = openSqlRegion(text, i, st);
  if (opened !== -1) return opened;
  const be = consumeBeginEnd(text, i, st);
  if (be !== -1) return be;
  if (text[i] === ";" && st.beginDepth === 0) {
    flushStatement(st);
    return i;
  }
  st.buf += text[i];
  return i;
}

export function parseSqlStatements(text: string): string[] {
  const st: SqlScanState = {
    stmts: [],
    buf: "",
    inSingle: false,
    inLineComment: false,
    inBlockComment: false,
    beginDepth: 0,
    dollarTag: null,
  };
  for (let i = 0; i < text.length; i++) {
    i = scanSqlChar(text, i, st);
  }
  flushStatement(st);
  return st.stmts;
}

export async function createClient({
  provider,
  connection,
}: {
  provider: string;
  connection: string;
}): Promise<MigrationClient> {
  return defaultDialectFactory.get(provider).createClient(connection);
}

export async function runUp({
  client,
  migrations,
  env = process.env,
}: {
  client: MigrationClient;
  migrations: MigrationDescriptor[];
  env?: NodeJS.ProcessEnv;
}): Promise<{ applied: boolean; name: string | null }> {
  const applied = await appliedRecords(client);
  await assertNoChecksumDrift({ migrations, applied, env });
  const next = migrations.find((m) => !applied.has(m.name));
  if (!next) return { applied: false, name: null };

  const sqlText = await readFile(next.upPath, "utf8");
  const sum = checksum(sqlText);

  const logId = await insertLogStarted(client, next.name, "up");
  const startedAt = Date.now();

  try {
    await client.transaction(async () => {
      const stmts = await readSqlStatements(next.upPath);
      for (const stmt of stmts) {
        await client.exec(stmt);
      }
      await insertMigrate(client, next.name, sum);
    });
  } catch (e) {
    const err = e as Error;
    await updateLogTerminal({
      client,
      id: logId,
      status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: String(err?.message ?? e),
    });
    throw e;
  }

  await updateLogTerminal({
    client,
    id: logId,
    status: "success",
    durationMs: Date.now() - startedAt,
    errorMessage: null,
  });
  return { applied: true, name: next.name };
}

export async function runDown({
  client,
  migrations,
  env = process.env,
}: {
  client: MigrationClient;
  migrations: MigrationDescriptor[];
  env?: NodeJS.ProcessEnv;
}): Promise<{ rolledBack: boolean; name: string | null }> {
  const applied = await appliedRecords(client);
  await assertNoChecksumDrift({ migrations, applied, env });
  if (applied.size === 0) return { rolledBack: false, name: null };

  const lastApplied = [...migrations]
    .reverse()
    .find((m) => applied.has(m.name));
  if (!lastApplied) {
    throw new Error(
      `Most recently applied migration is not present under --migrate-path`,
    );
  }
  if (!lastApplied.downPath) {
    throw new Error(
      `Cannot roll back "${lastApplied.name}": no rollback_*.sql sibling found`,
    );
  }
  const downPath = lastApplied.downPath;

  const logId = await insertLogStarted(client, lastApplied.name, "down");
  const startedAt = Date.now();

  try {
    await client.transaction(async () => {
      const stmts = await readSqlStatements(downPath);
      for (const stmt of stmts) {
        await client.exec(stmt);
      }
      await deleteMigrate(client, lastApplied.name);
    });
  } catch (e) {
    const err = e as Error;
    await updateLogTerminal({
      client,
      id: logId,
      status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: String(err?.message ?? e),
    });
    throw e;
  }

  await updateLogTerminal({
    client,
    id: logId,
    status: "success",
    durationMs: Date.now() - startedAt,
    errorMessage: null,
  });
  return { rolledBack: true, name: lastApplied.name };
}

function dialectOf(client: MigrationClient): ISqlDialect {
  return defaultDialectFactory.get(client.dialect);
}

async function appliedRecords(
  client: MigrationClient,
): Promise<Map<string, string | null>> {
  const d = dialectOf(client);
  const q = (ident: string) => d.quoteIdent(ident);
  const rows = await client.query(
    `SELECT ${q("name")} AS name, ${q("checksum")} AS checksum FROM ${q("migrates")}`,
  );
  return new Map(
    rows.map(
      (r) =>
        [r.name ?? r.NAME, r.checksum ?? r.CHECKSUM ?? null] as [
          string,
          string | null,
        ],
    ),
  );
}

async function assertNoChecksumDrift({
  migrations,
  applied,
  env = process.env,
}: {
  migrations: MigrationDescriptor[];
  applied: Map<string, string | null>;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  if (env.MIGRATE_ALLOW_CHECKSUM_DRIFT === "1") return;
  const drifted: { name: string; stored: string; current: string }[] = [];
  for (const m of migrations) {
    if (!applied.has(m.name)) continue;
    const stored = applied.get(m.name);
    if (stored == null) continue;
    const current = checksum(await readFile(m.upPath, "utf8"));
    if (current !== stored) drifted.push({ name: m.name, stored, current });
  }
  if (drifted.length === 0) return;
  const lines = drifted.map(
    (d) =>
      `  ${d.name}: stored ${d.stored.slice(0, 12)}..., current ${d.current.slice(0, 12)}...`,
  );
  throw new Error(
    [
      "Migration checksum drift detected — the migration file changed AFTER it was applied:",
      ...lines,
      "",
      "The DB and source disagree about the schema you're running. Either the codegen",
      "regenerated an already-applied migration in place (the canonical bug — emit a NEW",
      "migration file instead), or the migrate state was hand-edited.",
      "",
      "Recovery options:",
      "  1. Emit a new migration that brings the DB up to the current schema, then deploy.",
      "  2. For showcase/dev DBs with no real data: wipe the DB file and let migrate:up re-run from scratch.",
      "  3. If you've verified the DB matches the new file: MIGRATE_ALLOW_CHECKSUM_DRIFT=1 npm run migrate:up",
    ].join("\n"),
  );
}

async function insertMigrate(
  client: MigrationClient,
  name: string,
  sum: string,
): Promise<void> {
  const d = dialectOf(client);
  const t = d.quoteIdent("migrates");
  await client.run(
    `INSERT INTO ${t} (${d.quoteIdent("name")}, ${d.quoteIdent("checksum")}) VALUES (?, ?)`,
    [name, sum],
  );
}

async function deleteMigrate(
  client: MigrationClient,
  name: string,
): Promise<void> {
  const d = dialectOf(client);
  const t = d.quoteIdent("migrates");
  await client.run(
    `DELETE FROM ${t} WHERE ${d.quoteIdent("name")} = ?`,
    [name],
  );
}

async function insertLogStarted(
  client: MigrationClient,
  name: string,
  direction: string,
): Promise<MigrationRowValue> {
  const d = dialectOf(client);
  const t = d.quoteIdent("migrate_logs");
  if (d.usesLastInsertRowid) {
    const stmt = `INSERT INTO ${t} (${d.quoteIdent("migrate_name")}, ${d.quoteIdent("direction")}, ${d.quoteIdent("status")}) VALUES (?, ?, 'started')`;
    const db = client._raw;
    if (db) {
      const info = db.prepare(stmt).run(name, direction);
      return info.lastInsertRowid;
    }
    await client.run(stmt, [name, direction]);
    const rows = await client.query(
      `SELECT ${d.quoteIdent("id")} AS id FROM ${t} WHERE ${d.quoteIdent("migrate_name")} = ? AND ${d.quoteIdent("direction")} = ? ORDER BY id DESC ${d.limitClause(1)}`,
      [name, direction],
    );
    return rows[0]?.id;
  }
  await client.run(
    `INSERT INTO ${t} (${d.quoteIdent("migrate_name")}, ${d.quoteIdent("direction")}, ${d.quoteIdent("status")}) VALUES (?, ?, 'started')`,
    [name, direction],
  );
  const rows = await client.query(
    `SELECT ${d.quoteIdent("id")} AS id FROM ${t} WHERE ${d.quoteIdent("migrate_name")} = ? AND ${d.quoteIdent("direction")} = ? ORDER BY ${d.quoteIdent("id")} DESC ${d.limitClause(1)}`,
    [name, direction],
  );
  return rows[0]?.id ?? rows[0]?.ID;
}

async function updateLogTerminal({
  client,
  id,
  status,
  durationMs,
  errorMessage,
}: {
  client: MigrationClient;
  id: MigrationRowValue;
  status: string;
  durationMs: number;
  errorMessage: string | null;
}): Promise<void> {
  const d = dialectOf(client);
  const t = d.quoteIdent("migrate_logs");
  const setNow = d.nowExpr();
  await client.run(
    `UPDATE ${t} SET ${d.quoteIdent("status")} = ?, ${d.quoteIdent("finished_at")} = ${setNow}, ${d.quoteIdent("duration_ms")} = ?, ${d.quoteIdent("error_message")} = ?, ${d.quoteIdent("updated")} = ${setNow} WHERE ${d.quoteIdent("id")} = ?`,
    [status, durationMs, errorMessage, id],
  );
}

function requireDialect(dialect: string): SqlDialect {
  return defaultDialectFactory.get(dialect).name;
}
