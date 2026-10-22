import { SqliteDialect } from './sqlite-dialect.ts';

export const createDialect = (): SqliteDialect => new SqliteDialect();
export const provider = createDialect;
export { SqliteDialect, sqliteFilesystemPath } from './sqlite-dialect.ts';
