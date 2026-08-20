import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SqlDialect } from '../sql.ts';
import { templatesRoot } from './templates-root.ts';

export const readSqlTemplate = async (
  dialect: SqlDialect,
  name: 'migrates' | 'migrate_logs',
): Promise<string> =>
  (await readFile(join(templatesRoot(), 'sql', dialect, `${name}.sql`), 'utf8')).trim();
