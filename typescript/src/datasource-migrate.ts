import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultDialectFactory } from './infrastructure/default-factory.ts';
import { fillTemplate, loadMessage } from './infrastructure/message-templates.ts';
import type { MigrationDriver } from './abstractions/migration-driver.ts';
import type { SqlDialect } from './sql.ts';

export { normalizeDialect } from './sql.ts';
export type {
  MigrationClient,
  MigrationRow,
  MigrationSqlParam,
  SqliteRawDatabase,
} from './migration-client.ts';
export type { MigrationDriver, MigrationDriverId } from './abstractions/migration-driver.ts';
export { applyMysqlDdlViaTextProtocol } from './infrastructure/mysql-text-protocol.ts';

/** One discovered migration: its up script and the rollback sibling when present. */
export interface MigrationDescriptor {
  name: string;
  upPath: string;
  downPath: string | null;
}

const UP_SUFFIX = '_up.sql';
const DOWN_SUFFIX = '_down.sql';

const [
  checksumDriftTpl,
  checksumDriftLineTpl,
  rollbackNotInPathMsg,
  rollbackNoSiblingTpl,
  migratePathNotDirTpl,
] = await Promise.all([
  loadMessage('checksum-drift'),
  loadMessage('checksum-drift-line'),
  loadMessage('errors/rollback-not-in-path'),
  loadMessage('errors/rollback-no-rollback-sibling'),
  loadMessage('errors/migrate-path-not-dir'),
]);

const missingMigrationsDir = (path: string): Error =>
  new Error(fillTemplate(migratePathNotDirTpl, { path }).trimEnd());

export async function discoverMigrations({
  migratePath,
  dialect,
}: {
  migratePath: string;
  dialect: string;
}): Promise<MigrationDescriptor[]> {
  requireDialect(dialect);
  let st;
  try {
    st = await stat(migratePath);
  } catch {
    throw missingMigrationsDir(migratePath);
  }
  if (!st.isDirectory()) throw missingMigrationsDir(migratePath);

  const entries = await readdir(migratePath, { withFileTypes: true });
  const files = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  const ups: MigrationDescriptor[] = [];
  for (const name of files) {
    if (!name.endsWith(UP_SUFFIX)) continue;
    const stem = name.slice(0, -UP_SUFFIX.length);
    const downName = `${stem}${DOWN_SUFFIX}`;
    ups.push({
      name: stem,
      upPath: join(migratePath, name),
      downPath: files.has(downName) ? join(migratePath, downName) : null,
    });
  }
  ups.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return ups;
}

/** Strip pre-refactor `-- deterministic-content-hash: <sha>` header if present so upgrading users carrying the legacy header keep the same checksum migrate:up recorded. */
const LEGACY_HEADER_RE = /^(?:\/\/|--|#)\s+deterministic-content-hash:\s+[0-9a-f]{64}\s*\r?\n?/;

export function checksum(text: string): string {
  const body = text.replace(LEGACY_HEADER_RE, '');
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export async function applyOneUp({
  driver,
  migrations,
  env = process.env,
}: {
  driver: MigrationDriver;
  migrations: MigrationDescriptor[];
  env?: NodeJS.ProcessEnv;
}): Promise<{ applied: boolean; name: string | null }> {
  const applied = await driver.applied();
  await assertNoChecksumDrift({ migrations, applied, env });
  const next = migrations.find((m) => !applied.has(m.name));
  if (!next) return { applied: false, name: null };

  const sqlText = await readFile(next.upPath, 'utf8');
  const sum = checksum(sqlText);

  const logId = await driver.logStarted(next.name, 'up');
  const startedAt = Date.now();

  try {
    await driver.migrateUp(next.name, sqlText, sum);
  } catch (e) {
    const err = e as Error;
    await driver.logFinished(logId, 'error', Date.now() - startedAt, String(err?.message ?? e));
    throw e;
  }

  await driver.logFinished(logId, 'success', Date.now() - startedAt, null);
  return { applied: true, name: next.name };
}

export async function applyOneDown({
  driver,
  migrations,
  env = process.env,
}: {
  driver: MigrationDriver;
  migrations: MigrationDescriptor[];
  env?: NodeJS.ProcessEnv;
}): Promise<{ rolledBack: boolean; name: string | null }> {
  const applied = await driver.applied();
  await assertNoChecksumDrift({ migrations, applied, env });
  if (applied.size === 0) return { rolledBack: false, name: null };

  const lastApplied = [...migrations].reverse().find((m) => applied.has(m.name));
  if (!lastApplied) {
    throw new Error(rollbackNotInPathMsg.trimEnd());
  }
  if (!lastApplied.downPath) {
    throw new Error(
      fillTemplate(rollbackNoSiblingTpl, { name: lastApplied.name }).trimEnd(),
    );
  }
  const downPath = lastApplied.downPath;

  const logId = await driver.logStarted(lastApplied.name, 'down');
  const startedAt = Date.now();

  try {
    await driver.migrateDown(lastApplied.name, await readFile(downPath, 'utf8'));
  } catch (e) {
    const err = e as Error;
    await driver.logFinished(logId, 'error', Date.now() - startedAt, String(err?.message ?? e));
    throw e;
  }

  await driver.logFinished(logId, 'success', Date.now() - startedAt, null);
  return { rolledBack: true, name: lastApplied.name };
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
  if (env.MIGRATE_ALLOW_CHECKSUM_DRIFT === '1') return;
  const drifted: { name: string; stored: string; current: string }[] = [];
  for (const m of migrations) {
    if (!applied.has(m.name)) continue;
    const stored = applied.get(m.name);
    if (stored == null) continue;
    const current = checksum(await readFile(m.upPath, 'utf8'));
    if (current !== stored) drifted.push({ name: m.name, stored, current });
  }
  if (drifted.length === 0) return;
  const lines = drifted
    .map((d) =>
      fillTemplate(checksumDriftLineTpl, {
        name: d.name,
        stored: d.stored.slice(0, 12),
        current: d.current.slice(0, 12),
      }).trimEnd(),
    )
    .join('\n');
  throw new Error(fillTemplate(checksumDriftTpl, { lines }).trimEnd());
}

function requireDialect(dialect: string): SqlDialect {
  return defaultDialectFactory.get(dialect).name;
}
